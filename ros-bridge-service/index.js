import 'dotenv/config'
import * as ROSLIB from 'roslib'
import mqtt from 'mqtt'

// --- MQTT ---
const mqttClient = mqtt.connect(process.env.MQTT_BROKER)

mqttClient.on('connect', () => {
    console.log('[MQTT] Connected to broker')
})

mqttClient.on('error', (err) => {
    console.error('[MQTT] Error:', err.message)
})

// --- ROS ---
function createRosConnection() {
    const ros = new ROSLIB.Ros({ url: process.env.ROSBRIDGE_URL })

    ros.on('connection', () => {
        console.log('[ROS] Connected to rosbridge')
        subscribeToTopics(ros)
        listenToCommands(ros)  // 👈 added
    })

    ros.on('error', (err) => {
        console.error('[ROS] Error:', err)
    })

    ros.on('close', () => {
        console.warn('[ROS] Connection closed — reconnecting in 3s...')
        setTimeout(createRosConnection, 3000)
    })
}

// --- Subscriptions ---
function subscribeToTopics(ros) {
    const odom = new ROSLIB.Topic({
        ros,
        name: '/diff_controller/odom',
        messageType: 'nav_msgs/Odometry'
    })

    odom.subscribe((msg) => {
        const payload = {
            timestamp: Date.now(),
            position: msg.pose.pose.position,
            orientation: msg.pose.pose.orientation,
            linear_velocity: msg.twist.twist.linear,
            angular_velocity: msg.twist.twist.angular
        }

        mqttClient.publish(
            'robot/odom',
            JSON.stringify(payload),
            { qos: 1 },
            (err) => {
                if (err) console.error('[MQTT] Publish error:', err)
                else console.log('[ROS→MQTT] odom published')
            }
        )
    })
}

// --- Command Listener ---        // 👈 entirely new function
function listenToCommands(ros) {
    const cmdVel = new ROSLIB.Topic({
        ros,
        name: '/web_teleop/cmd_vel',
        messageType: 'geometry_msgs/Twist'
    })

    mqttClient.subscribe('robot/cmd', (err) => {
        if (err) console.error('[MQTT] Subscribe error:', err)
        else console.log('[MQTT] Subscribed to robot/cmd')
    })

    mqttClient.on('message', (topic, message) => {
        if (topic !== 'robot/cmd') return

        const cmd = JSON.parse(message.toString())
        console.log('[MQTT→ROS] Command received:', cmd)

        cmdVel.publish({
            linear: { x: cmd.linear_x ?? 0, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: cmd.angular_z ?? 0 }
        })
        console.log('[MQTT→ROS] cmd_vel published')
    })
}

// --- Start ---
createRosConnection()