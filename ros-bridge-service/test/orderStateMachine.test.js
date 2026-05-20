// Tests for src/orderStateMachine.js — GoalStatus mapping and the idle snapshot (G13).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import OrderStateMachine, { mapStatus } from '../src/orderStateMachine.js'

test('mapStatus maps actionlib GoalStatus codes to VDA5050 statuses', () => {
    assert.equal(mapStatus(3), 'SUCCEEDED')
    assert.equal(mapStatus(2), 'PREEMPTED')
    assert.equal(mapStatus(8), 'PREEMPTED')
    assert.equal(mapStatus(4), 'ABORTED')
    assert.equal(mapStatus(5), 'ABORTED')
    assert.equal(mapStatus(9), 'ABORTED')
})

test('mapStatus treats pending/active codes as NAVIGATING', () => {
    for (const code of [0, 1, 6, 7]) {
        assert.equal(mapStatus(code), 'NAVIGATING')
    }
})

test('a fresh state machine reports an empty snapshot', () => {
    const snapshot = new OrderStateMachine().snapshot()
    assert.deepEqual(snapshot, {
        orderId: '',
        orderUpdateId: 0,
        lastNodeId: '',
        lastNodeSequenceId: 0,
        nodeStates: [],
        actionStates: [],
    })
})

test('a fresh state machine reports no errors', () => {
    assert.deepEqual(new OrderStateMachine().getErrors(), [])
})

test('a failed navigation result surfaces a navigationFailed error (G17)', () => {
    const osm = new OrderStateMachine()
    osm._nodes = [{ nodeId: 'n1', sequenceId: 0, released: true }]
    osm._nodeIdx = 0
    osm._onResult({ status: { status: 4 } })   // 4 = ABORTED

    const errors = osm.getErrors()
    assert.equal(errors.length, 1)
    assert.equal(errors[0].errorType, 'navigationFailed')
    assert.equal(errors[0].errorLevel, 'WARNING')
})

test('a successful result clears a prior navigationFailed error (G17)', () => {
    const osm = new OrderStateMachine()
    osm._nodes = [{ nodeId: 'n1', sequenceId: 0, released: true }]
    osm._nodeIdx = 0
    osm._navError = { errorType: 'navigationFailed', errorLevel: 'WARNING' }
    osm._onResult({ status: { status: 3 } })   // 3 = SUCCEEDED

    assert.deepEqual(osm.getErrors(), [])
})
