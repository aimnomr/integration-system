import * as ROSLIB from 'roslib'
import logger from './logger.js'

// Subscribes the AMCL map-localised pose (/amcl_pose) and feeds agvPosition into the
// robot's StateBuilder. /amcl_pose is available only in mapping:=false mode.
// Throttled: pushes a position update on >0.05 m or >5° change — this is the main
// `state` publish trigger. One PoseBridge instance per Robot.

const DIST_THRESHOLD = 0.05
const HEAD_THRESHOLD = 5 * Math.PI / 180

function yawOf(o) {
    return Math.atan2(
        2 * (o.w * o.z + o.x * o.y),
        1 - 2 * (o.y * o.y + o.z * o.z)
    )
}

export default class PoseBridge {
    constructor(stateBuilder) {
        this._state   = stateBuilder
        this._topic   = null
        this._lastPos = null
        this._lastYaw = null
    }

    setup(ros) {
        this._topic = new ROSLIB.Topic({
            ros,
            name: '/amcl_pose',
            messageType: 'geometry_msgs/PoseWithCovarianceStamped',
        })
        this._topic.subscribe((msg) => {
            const p   = msg.pose.pose.position
            const yaw = yawOf(msg.pose.pose.orientation)

            let changed = false
            if (!this._lastPos) {
                changed = true
            } else {
                const d  = Math.sqrt((p.x - this._lastPos.x) ** 2 + (p.y - this._lastPos.y) ** 2)
                let   dh = Math.abs(yaw - this._lastYaw)
                if (dh > Math.PI) dh = 2 * Math.PI - dh
                changed = d > DIST_THRESHOLD || dh > HEAD_THRESHOLD
            }

            if (changed) {
                this._lastPos = { x: p.x, y: p.y }
                this._lastYaw = yaw
                this._state.setPosition({ x: p.x, y: p.y, theta: yaw })
            }
        })
        logger.info('Pose subscribed', { topic: '/amcl_pose' })
    }

    teardown() {
        this._topic?.unsubscribe()
        this._topic   = null
        this._lastPos = null
        this._lastYaw = null
    }
}
