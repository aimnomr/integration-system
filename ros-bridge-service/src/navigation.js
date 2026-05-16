import * as ROSLIB from 'roslib'
import mqttClient from './mqttClient.js'
import logger from './logger.js'

let waypointQueue      = []
let currentWaypointIdx = 0
let sequenceActive     = false   // true while a waypoint sequence is running

export function resetWaypoints() {
    waypointQueue      = []
    currentWaypointIdx = 0
    sequenceActive     = false
}

// Single goal — clears any active sequence.
export function sendGoal(ros, goal) {
    sequenceActive = false
    _sendGoalRaw(ros, goal)
}

export function startWaypoints(ros, data) {
    waypointQueue      = data.waypoints ?? []
    currentWaypointIdx = 0
    sequenceActive     = waypointQueue.length > 0
    logger.info('Waypoint sequence started', { count: waypointQueue.length })
    _publishProgress()
    _sendNext(ros)
}

export function retryWaypoint(ros) {
    logger.info('Retrying waypoint', { index: currentWaypointIdx + 1 })
    _sendNext(ros)
}

export function skipWaypoint(ros) {
    logger.info('Skipping waypoint', { index: currentWaypointIdx + 1 })
    currentWaypointIdx++
    _publishProgress()
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
    logger.info('Cancel published')
}

// Called by navFeedback when move_base reports a terminal goal result.
// On success, advances the waypoint sequence; on failure, pauses for manual
// retry/skip.
export function handleGoalResult(ros, status) {
    if (!sequenceActive) return   // single goal, or no sequence — nothing to advance

    if (status === 'SUCCEEDED') {
        currentWaypointIdx++
        if (currentWaypointIdx < waypointQueue.length) {
            _publishProgress()
            _sendNext(ros)
        } else {
            logger.info('Waypoint sequence complete')
            _publishProgress()
            sequenceActive = false
        }
    } else {
        logger.warn('Waypoint goal did not succeed; sequence paused', {
            status, index: currentWaypointIdx + 1,
        })
    }
}

function _sendGoalRaw(ros, goal) {
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
    logger.info('Goal sent', { x: goal.x, y: goal.y, yaw })
}

function _sendNext(ros) {
    if (currentWaypointIdx >= waypointQueue.length) {
        logger.info('Waypoint sequence complete')
        sequenceActive = false
        return
    }
    const wp = waypointQueue[currentWaypointIdx]
    logger.info('Sending waypoint', {
        index: currentWaypointIdx + 1, total: waypointQueue.length, label: wp.label,
    })
    _sendGoalRaw(ros, wp)
}

function _publishProgress() {
    const total = waypointQueue.length
    const wp    = waypointQueue[currentWaypointIdx]
    const payload = {
        timestamp:     new Date().toISOString(),
        current_idx:   currentWaypointIdx,
        total,
        progress_pct:  total > 0 ? Math.min(100, (currentWaypointIdx / total) * 100) : 0,
        current_label: wp ? wp.label : '',
    }
    mqttClient.publish('amr/state/nav/progress', JSON.stringify(payload), { qos: 0 }, (err) => {
        if (err) logger.error('Publish failed', { topic: 'amr/state/nav/progress', error: err.message })
    })
}
