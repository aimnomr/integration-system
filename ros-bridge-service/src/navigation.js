import * as ROSLIB from 'roslib'

let waypointQueue      = []
let currentWaypointIdx = 0

export function resetWaypoints() {
    waypointQueue      = []
    currentWaypointIdx = 0
}

export function sendGoal(ros, goal) {
    const yaw = goal.angle?.z ?? 0
    const goalTopic = new ROSLIB.Topic({
        ros,
        name: process.env.NAV_GOAL_TOPIC || '/move_base_simple/goal',
        messageType: 'geometry_msgs/PoseStamped',
    })
    goalTopic.publish({
        header: { frame_id: 'map', stamp: { sec: 0, nsec: 0 } },
        pose: {
            position:    { x: goal.x, y: goal.y, z: 0 },
            orientation: { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) },
        },
    })
    console.log(`[MQTT→ROS] Goal → (${goal.x}, ${goal.y}, yaw=${yaw.toFixed(3)}rad)`)
}

export function startWaypoints(ros, data) {
    waypointQueue      = data.waypoints ?? []
    currentWaypointIdx = 0
    console.log(`[Waypoints] Starting sequence of ${waypointQueue.length} waypoints`)
    _sendNext(ros)
}

export function retryWaypoint(ros) {
    console.log(`[Waypoints] Retrying waypoint ${currentWaypointIdx + 1}`)
    _sendNext(ros)
}

export function skipWaypoint(ros) {
    console.log(`[Waypoints] Skipping waypoint ${currentWaypointIdx + 1}`)
    currentWaypointIdx++
    _sendNext(ros)
}

export function cancelGoal(ros) {
    resetWaypoints()
    const cancelTopic = new ROSLIB.Topic({
        ros,
        name: process.env.CANCEL_TOPIC || '/move_base/cancel',
        messageType: 'actionlib_msgs/GoalID',
    })
    cancelTopic.publish({ stamp: { sec: 0, nsec: 0 }, id: '' })
    console.log('[MQTT→ROS] Cancel published')
}

function _sendNext(ros) {
    if (currentWaypointIdx >= waypointQueue.length) {
        console.log('[Waypoints] Sequence complete')
        return
    }
    const wp = waypointQueue[currentWaypointIdx]
    console.log(`[Waypoints] Sending ${currentWaypointIdx + 1}/${waypointQueue.length}: ${wp.label}`)
    sendGoal(ros, wp)
}
