import * as ROSLIB from 'roslib'
import logger from './logger.js'

// Owns one robot's order execution. Accepts VDA5050 `order` messages, drives
// move_base node-by-node (waits for each /move_base/result before sending the next
// node), and applies `instantActions` (cancelOrder / retryNode / skipNode). Exposes
// snapshot() — the order-related fields of the VDA5050 `state` message.
//
// Replaces the legacy navigation.js + navFeedback.js modules.

// actionlib_msgs/GoalStatus code → status string
function mapStatus(code) {
    switch (code) {
        case 3:                 return 'SUCCEEDED'
        case 2: case 8:         return 'PREEMPTED'
        case 4: case 5: case 9: return 'ABORTED'
        default:                return 'NAVIGATING'   // 0 PENDING, 1 ACTIVE, 6 PREEMPTING, 7 RECALLING
    }
}

export default class OrderStateMachine {
    constructor() {
        this._ros         = null
        this._goalTopic   = null
        this._cancelTopic = null
        this._statusTopic = null
        this._resultTopic = null

        this._order   = null   // current order message
        this._nodes   = []     // released nodes, sorted by sequenceId
        this._nodeIdx = 0

        this.lastNodeId         = ''
        this.lastNodeSequenceId = 0
        this.navStatus          = 'IDLE'
        this.actionStates       = []

        this._onChange = null
    }

    setup(ros, onChange) {
        this._ros      = ros
        this._onChange = onChange

        this._goalTopic = new ROSLIB.Topic({
            ros,
            name: process.env.NAV_GOAL_TOPIC || '/move_base_simple/goal',
            messageType: 'geometry_msgs/PoseStamped',
        })
        this._cancelTopic = new ROSLIB.Topic({
            ros,
            name: process.env.CANCEL_TOPIC || '/move_base/cancel',
            messageType: 'actionlib_msgs/GoalID',
        })
        this._statusTopic = new ROSLIB.Topic({
            ros,
            name: '/move_base/status',
            messageType: 'actionlib_msgs/GoalStatusArray',
        })
        this._resultTopic = new ROSLIB.Topic({
            ros,
            name: '/move_base/result',
            messageType: 'move_base_msgs/MoveBaseActionResult',
        })

        this._statusTopic.subscribe((msg) => this._onStatus(msg))
        this._resultTopic.subscribe((msg) => this._onResult(msg))
        logger.info('Order state machine ready')
    }

    teardown() {
        this._statusTopic?.unsubscribe()
        this._resultTopic?.unsubscribe()
        this._statusTopic = null
        this._resultTopic = null
    }

    // --- inbound: order ---
    acceptOrder(order) {
        this._order = order
        this._nodes = (order.nodes || [])
            .filter((n) => n.released)
            .sort((a, b) => a.sequenceId - b.sequenceId)
        this._nodeIdx = 0
        this.actionStates = []
        logger.info('Order accepted', {
            orderId: order.orderId, orderUpdateId: order.orderUpdateId, nodes: this._nodes.length,
        })
        this._sendCurrentNode()
        this._emit()
    }

    // --- inbound: instantActions ---
    applyAction(action) {
        const { actionType, actionId } = action
        logger.info('Instant action', { actionType, actionId })
        switch (actionType) {
            case 'cancelOrder': this._cancelOrder();          break
            case 'retryNode':   this._sendCurrentNode();      break
            case 'skipNode':    this._nodeIdx++; this._sendCurrentNode(); break
            default:
                logger.warn('Unknown actionType', { actionType })
                return
        }
        this.actionStates = [{ actionId: actionId || '', actionType, actionStatus: 'FINISHED' }]
        this._emit()
    }

    // --- move_base feedback ---
    _onStatus(msg) {
        const list   = msg.status_list || []
        const mapped = list.length ? mapStatus(list[list.length - 1].status) : 'IDLE'
        // Surface NAVIGATING transitions; terminal states come via _onResult.
        if (mapped === 'NAVIGATING' && this.navStatus !== 'NAVIGATING') {
            this.navStatus = 'NAVIGATING'
            this._emit()
        }
    }

    _onResult(msg) {
        const mapped = mapStatus(msg.status?.status)
        this.navStatus = mapped
        logger.info('Navigation result', { status: mapped, code: msg.status?.status })

        if (mapped === 'SUCCEEDED') {
            const node = this._nodes[this._nodeIdx]
            if (node) {
                this.lastNodeId         = node.nodeId
                this.lastNodeSequenceId = node.sequenceId
            }
            this._nodeIdx++
            if (this._nodeIdx < this._nodes.length) {
                this._sendCurrentNode()
            } else {
                logger.info('Order complete', { orderId: this._order?.orderId })
            }
        } else {
            logger.warn('Node did not succeed; order paused', {
                status: mapped, index: this._nodeIdx + 1,
            })
        }
        this._emit()
    }

    _sendCurrentNode() {
        const node = this._nodes[this._nodeIdx]
        if (!node) {
            logger.info('No node to send')
            return
        }
        const pos   = node.nodePosition || {}
        const theta = pos.theta ?? 0
        this._goalTopic.publish({
            header: { frame_id: 'map', stamp: { sec: 0, nsec: 0 } },
            pose: {
                position:    { x: pos.x, y: pos.y, z: 0 },
                orientation: { x: 0, y: 0, z: Math.sin(theta / 2), w: Math.cos(theta / 2) },
            },
        })
        logger.info('Node goal sent', {
            nodeId: node.nodeId, sequenceId: node.sequenceId,
            index: this._nodeIdx + 1, total: this._nodes.length,
        })
    }

    _cancelOrder() {
        this._cancelTopic?.publish({ stamp: { sec: 0, nsec: 0 }, id: '' })
        this._order    = null
        this._nodes    = []
        this._nodeIdx  = 0
        this.navStatus = 'IDLE'
        logger.info('Order cancelled')
    }

    _emit() {
        this._onChange?.()
    }

    // The order-related fields of the VDA5050 `state` message.
    snapshot() {
        const nodeStates = this._nodes.slice(this._nodeIdx).map((n) => ({
            nodeId: n.nodeId, sequenceId: n.sequenceId, released: n.released,
        }))
        return {
            orderId:            this._order?.orderId || '',
            orderUpdateId:      this._order?.orderUpdateId ?? 0,
            lastNodeId:         this.lastNodeId,
            lastNodeSequenceId: this.lastNodeSequenceId,
            nodeStates,
            actionStates:       this.actionStates,
        }
    }
}
