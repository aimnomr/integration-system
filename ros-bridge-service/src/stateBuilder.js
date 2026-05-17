import logger from './logger.js'

// Assembles and publishes the VDA5050 `state` message for one robot. Inputs are
// pushed in by the bridges (position from PoseBridge, motion from OdomBridge) and the
// order state machine. Published on a significant change — position / order / error —
// plus a 5 s heartbeat. See docs/schema/VDA5050_MESSAGES.md.

const HEARTBEAT_MS = 5000

export default class StateBuilder {
    constructor({ mqttClient, topic, header, mapId, orderStateMachine }) {
        this._mqtt   = mqttClient
        this._topic  = topic
        this._header = header
        this._osm    = orderStateMachine

        this._position = { x: 0, y: 0, theta: 0, mapId, positionInitialized: false }
        this._velocity = { vx: 0, vy: 0, omega: 0 }
        this._driving  = false
        this._errors   = []
        this._safety   = { eStop: 'NONE', fieldViolation: false }

        this._heartbeat = null
    }

    start() {
        this._heartbeat = setInterval(() => this.publish('heartbeat'), HEARTBEAT_MS)
    }

    stop() {
        clearInterval(this._heartbeat)
        this._heartbeat = null
    }

    // --- inputs ---

    // Position change is the main publish trigger (PoseBridge applies the throttle).
    setPosition({ x, y, theta }) {
        this._position = { ...this._position, x, y, theta, positionInitialized: true }
        this.publish('position')
    }

    // Motion updates are high-frequency — stored, not published; the next
    // position/heartbeat publish carries the latest value.
    setMotion({ vx, vy, omega }, driving) {
        this._velocity = { vx, vy, omega }
        this._driving  = driving
    }

    setError(error) {
        this._errors = [error]
        this.publish('error')
    }

    clearErrors() {
        if (this._errors.length) {
            this._errors = []
            this.publish('error')
        }
    }

    onOrderChange() {
        this.publish('order')
    }

    publish(trigger) {
        const order = this._osm.snapshot()
        const msg = {
            ...this._header.next('state'),
            orderId:            order.orderId,
            orderUpdateId:      order.orderUpdateId,
            lastNodeId:         order.lastNodeId,
            lastNodeSequenceId: order.lastNodeSequenceId,
            nodeStates:         order.nodeStates,
            edgeStates:         [],
            actionStates:       order.actionStates,
            agvPosition:        this._position,
            velocity:           this._velocity,
            driving:            this._driving,
            operatingMode:      'AUTOMATIC',
            errors:             this._errors,
            safetyState:        this._safety,
        }
        this._mqtt.publish(this._topic, JSON.stringify(msg), { qos: 0 }, (err) => {
            if (err) logger.error('Publish failed', { topic: this._topic, error: err.message })
            else logger.debug('Published state', { trigger })
        })
    }
}
