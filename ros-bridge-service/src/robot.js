import RosConnection from './rosConnection.js'
import OrderStateMachine from './orderStateMachine.js'
import StateBuilder from './stateBuilder.js'
import OdomBridge from './odomBridge.js'
import PoseBridge from './poseBridge.js'
import { createMqttClient } from './mqttClient.js'
import { buildTopic, HeaderFactory, isValidOrder, isValidInstantActions } from './vda5050.js'
import logger from './logger.js'

// The rosbridge URL is stored once in the database and served to *both* the
// browser and this service. From the browser, `localhost` means the host
// machine — correct. From inside a Docker container, `localhost` means the
// container itself, so the robot is unreachable. ROSBRIDGE_HOST_OVERRIDE lets
// the container (only) rewrite a loopback host to e.g. `host.docker.internal`
// without changing the value the browser receives. No-op when unset, or when
// the URL host isn't loopback (real robots on real IPs are left alone).
function applyHostOverride(url) {
    const override = process.env.ROSBRIDGE_HOST_OVERRIDE
    if (!override) return url
    try {
        const u = new URL(url)
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
            u.hostname = override
            return u.toString().replace(/\/$/, '')
        }
    } catch {
        logger.warn('Could not parse rosbridge URL for host override', { url })
    }
    return url
}

// One robot: owns its rosbridge connection, its own MQTT client, all per-robot
// bridges, the order state machine and the state builder. A fleet is N of these.
//
// Each Robot has its own MQTT client so it can register a per-robot Last-Will — the
// retained CONNECTIONBROKEN message on its `connection` topic. It speaks the VDA5050
// topic set: subscribes `order` + `instantActions`, publishes `state` + `connection`.
export default class Robot {
    constructor(fleetConfig, robotConfig) {
        this.serialNumber  = robotConfig.serialNumber
        this.manufacturer  = fleetConfig.manufacturer
        this.mapId         = robotConfig.mapId
        this._rosbridgeUrl = applyHostOverride(robotConfig.rosbridgeUrl)

        this._header = new HeaderFactory(fleetConfig, this.serialNumber)

        this._topics = {
            order:          buildTopic(fleetConfig, this.serialNumber, 'order'),
            instantActions: buildTopic(fleetConfig, this.serialNumber, 'instantActions'),
            state:          buildTopic(fleetConfig, this.serialNumber, 'state'),
            connection:     buildTopic(fleetConfig, this.serialNumber, 'connection'),
        }

        // Last-Will: a retained CONNECTIONBROKEN, emitted by the broker if this
        // process dies without a clean disconnect.
        const willPayload = JSON.stringify({
            ...this._header.next('connection'),
            connectionState: 'CONNECTIONBROKEN',
        })
        this._mqtt = createMqttClient({
            will: { topic: this._topics.connection, payload: willPayload },
        })

        this._osm   = new OrderStateMachine()
        this._state = new StateBuilder({
            mqttClient:        this._mqtt,
            topic:             this._topics.state,
            header:            this._header,
            mapId:             this.mapId,
            orderStateMachine: this._osm,
        })
        this._odom = new OdomBridge(this._state)
        this._pose = new PoseBridge(this._state)

        this._rosConn = new RosConnection({
            url:          this._rosbridgeUrl,
            onConnect:    (ros) => this._onRosConnect(ros),
            onDisconnect: ()    => this._onRosDisconnect(),
            onError:      (type, message) => this._onRosError(type, message),
        })
    }

    start() {
        logger.info('Starting robot', { serial: this.serialNumber, url: this._rosbridgeUrl })
        // Register handlers once; (re)subscribe on every MQTT (re)connect.
        this._mqtt.on('connect', () => this._subscribeCommands())
        this._mqtt.on('message', (topic, payload) => this._onMessage(topic, payload))
        this._state.start()
        this._rosConn.connect()
    }

    // Graceful shutdown: announce OFFLINE and close cleanly.
    stop() {
        this._publishConnection('OFFLINE')
        this._state.stop()
        this._rosConn.disconnect()
        this._mqtt.end()
    }

    _subscribeCommands() {
        const topics = [this._topics.order, this._topics.instantActions]
        this._mqtt.subscribe(topics, (err) => {
            if (err) logger.error('MQTT subscribe failed', { serial: this.serialNumber, error: err.message })
            else logger.info('Subscribed to command topics', { serial: this.serialNumber })
        })
    }

    _onMessage(topic, payload) {
        let msg
        try {
            msg = JSON.parse(payload.toString())
        } catch {
            logger.warn('Bad JSON payload', { topic })
            return
        }

        if (topic === this._topics.order) {
            if (!isValidOrder(msg)) { logger.warn('Invalid order message', { topic }); return }
            this._osm.acceptOrder(msg)
        } else if (topic === this._topics.instantActions) {
            if (!isValidInstantActions(msg)) { logger.warn('Invalid instantActions message', { topic }); return }
            for (const action of msg.actions) this._osm.applyAction(action)
        }
    }

    _onRosConnect(ros) {
        this._odom.setup(ros)
        this._pose.setup(ros)
        this._osm.setup(ros, () => this._state.onOrderChange())
        this._state.clearErrors()
        this._publishConnection('ONLINE')
    }

    _onRosDisconnect() {
        this._odom.teardown()
        this._pose.teardown()
        this._osm.teardown()
    }

    _onRosError(errorType, message) {
        this._state.setError({
            errorType,
            errorDescription: message,
            errorLevel: 'WARNING',
        })
    }

    _publishConnection(connectionState) {
        const msg = JSON.stringify({
            ...this._header.next('connection'),
            connectionState,
        })
        this._mqtt.publish(this._topics.connection, msg, { qos: 1, retain: true }, (err) => {
            if (err) logger.error('Publish failed', { topic: this._topics.connection, error: err.message })
            else logger.info('Connection state published', { connectionState, serial: this.serialNumber })
        })
    }
}
