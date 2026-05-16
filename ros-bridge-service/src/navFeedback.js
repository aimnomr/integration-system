import * as ROSLIB from 'roslib'
import logger from './logger.js'

// move_base is an actionlib server. It publishes goal status on
// /move_base/status (continuous) and the terminal outcome on /move_base/result.
// This module turns those into amr/state/nav/status messages and notifies the
// navigation manager when a goal finishes (so a waypoint sequence can advance).

// actionlib_msgs/GoalStatus codes → schema enum (IDLE|NAVIGATING|SUCCEEDED|ABORTED|PREEMPTED)
function mapStatus(code) {
    switch (code) {
        case 3:                 return 'SUCCEEDED'
        case 2: case 8:         return 'PREEMPTED'
        case 4: case 5: case 9: return 'ABORTED'
        default:                return 'NAVIGATING'   // 0 PENDING, 1 ACTIVE, 6 PREEMPTING, 7 RECALLING
    }
}

let statusTopic   = null
let resultTopic   = null
let lastPublished = null

export function setupNavFeedback(ros, mqttClient, onResult) {
    statusTopic = new ROSLIB.Topic({
        ros,
        name: '/move_base/status',
        messageType: 'actionlib_msgs/GoalStatusArray',
    })
    resultTopic = new ROSLIB.Topic({
        ros,
        name: '/move_base/result',
        messageType: 'move_base_msgs/MoveBaseActionResult',
    })

    // Continuous status — used only to surface NAVIGATING / IDLE transitions.
    statusTopic.subscribe((msg) => {
        const list = msg.status_list || []
        if (list.length === 0) {
            _publishStatus('IDLE', '', '', 0, mqttClient)
            return
        }
        const latest = list[list.length - 1]
        const mapped = mapStatus(latest.status)
        if (mapped === 'NAVIGATING') {
            _publishStatus('NAVIGATING', latest.goal_id?.id || '', latest.text || '', latest.status, mqttClient)
        }
    })

    // Terminal outcome — published once per goal.
    resultTopic.subscribe((msg) => {
        const st = msg.status || {}
        const mapped = mapStatus(st.status)
        _publishStatus(mapped, st.goal_id?.id || '', st.text || '', st.status, mqttClient, true)
        logger.info('Navigation result', { status: mapped, code: st.status })
        onResult?.(mapped)
    })

    logger.info('Nav feedback subscribed', { topics: ['/move_base/status', '/move_base/result'] })
}

export function teardownNavFeedback() {
    statusTopic?.unsubscribe()
    resultTopic?.unsubscribe()
    statusTopic   = null
    resultTopic   = null
    lastPublished = null
}

// force=true bypasses de-duplication (terminal results always publish).
function _publishStatus(status, goalId, text, code, mqttClient, force = false) {
    if (!force && status === lastPublished) return
    lastPublished = status
    const payload = {
        timestamp:   new Date().toISOString(),
        status,
        goal_id:     goalId,
        status_code: code,
        text,
    }
    mqttClient.publish('amr/state/nav/status', JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) logger.error('Publish failed', { topic: 'amr/state/nav/status', error: err.message })
    })
}
