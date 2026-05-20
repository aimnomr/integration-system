// Tests for src/stateBuilder.js — VDA5050 `state` message assembly (G13).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import StateBuilder from '../src/stateBuilder.js'

// --- test doubles ---

function mockMqtt() {
    const published = []
    return {
        published,
        publish(topic, payload, opts, cb) {
            published.push({ topic, payload, opts })
            cb?.(null)
        },
    }
}

const mockHeader = { next: () => ({ headerId: 7, timestamp: 't', version: '2.0.0' }) }

function mockOsm({ errors = [], ...overrides } = {}) {
    return {
        snapshot: () => ({
            orderId: 'order-1',
            orderUpdateId: 0,
            lastNodeId: 'n0',
            lastNodeSequenceId: 0,
            nodeStates: [],
            actionStates: [],
            ...overrides,
        }),
        getErrors: () => errors,
    }
}

function makeBuilder(mqtt) {
    return new StateBuilder({
        mqttClient: mqtt,
        topic: 'amr/v2/cpr/amr001/state',
        header: mockHeader,
        mapId: 'map-001',
        orderStateMachine: mockOsm(),
    })
}

// --- tests ---

test('publish() emits a VDA5050 state message on the configured topic', () => {
    const mqtt = mockMqtt()
    makeBuilder(mqtt).publish('test')

    assert.equal(mqtt.published.length, 1)
    assert.equal(mqtt.published[0].topic, 'amr/v2/cpr/amr001/state')

    const msg = JSON.parse(mqtt.published[0].payload)
    assert.equal(msg.headerId, 7)
    assert.equal(msg.orderId, 'order-1')
    assert.equal(msg.operatingMode, 'AUTOMATIC')
    assert.deepEqual(msg.edgeStates, [])
})

test('setPosition() updates agvPosition and triggers a publish', () => {
    const mqtt = mockMqtt()
    const sb = makeBuilder(mqtt)
    sb.setPosition({ x: 1.5, y: -2.0, theta: 0.25 })

    assert.equal(mqtt.published.length, 1)
    const msg = JSON.parse(mqtt.published[0].payload)
    assert.equal(msg.agvPosition.x, 1.5)
    assert.equal(msg.agvPosition.y, -2.0)
    assert.equal(msg.agvPosition.mapId, 'map-001')
    assert.equal(msg.agvPosition.positionInitialized, true)
})

test('setMotion() is stored but does not publish on its own', () => {
    const mqtt = mockMqtt()
    const sb = makeBuilder(mqtt)
    sb.setMotion({ vx: 0.4, vy: 0, omega: 0.1 }, true)

    assert.equal(mqtt.published.length, 0)
    sb.publish('check')
    const msg = JSON.parse(mqtt.published[0].payload)
    assert.equal(msg.velocity.vx, 0.4)
    assert.equal(msg.driving, true)
})

test('setError() and clearErrors() publish and toggle the errors array', () => {
    const mqtt = mockMqtt()
    const sb = makeBuilder(mqtt)

    sb.setError({ errorType: 'navigation', errorLevel: 'WARNING' })
    let msg = JSON.parse(mqtt.published.at(-1).payload)
    assert.equal(msg.errors.length, 1)

    sb.clearErrors()
    msg = JSON.parse(mqtt.published.at(-1).payload)
    assert.deepEqual(msg.errors, [])
})

test('navigation errors from the order state machine reach state.errors (G17)', () => {
    const mqtt = mockMqtt()
    const sb = new StateBuilder({
        mqttClient: mqtt,
        topic: 'amr/v2/cpr/amr001/state',
        header: mockHeader,
        mapId: 'map-001',
        orderStateMachine: mockOsm({
            errors: [{ errorType: 'navigationFailed', errorLevel: 'WARNING' }],
        }),
    })
    sb.publish('test')
    const msg = JSON.parse(mqtt.published[0].payload)
    assert.equal(msg.errors.length, 1)
    assert.equal(msg.errors[0].errorType, 'navigationFailed')
})
