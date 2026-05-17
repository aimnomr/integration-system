import * as ROSLIB from 'roslib'
import logger from './logger.js'

// Subscribes /diff_controller/odom and feeds velocity + driving into the robot's
// StateBuilder. The VDA5050 `agvPosition` comes from /amcl_pose (PoseBridge); odom
// here supplies only motion. One OdomBridge instance per Robot.
export default class OdomBridge {
    constructor(stateBuilder) {
        this._state = stateBuilder
        this._topic = null
    }

    setup(ros) {
        this._topic = new ROSLIB.Topic({
            ros,
            name: '/diff_controller/odom',
            messageType: 'nav_msgs/Odometry',
        })
        this._topic.subscribe((msg) => {
            const lin = msg.twist.twist.linear
            const ang = msg.twist.twist.angular
            const driving = Math.abs(lin.x) > 0.01 || Math.abs(ang.z) > 0.01
            this._state.setMotion({ vx: lin.x, vy: lin.y, omega: ang.z }, driving)
        })
        logger.info('Odom subscribed', { topic: '/diff_controller/odom' })
    }

    teardown() {
        this._topic?.unsubscribe()
        this._topic = null
    }
}
