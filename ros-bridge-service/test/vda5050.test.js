// Tests for src/vda5050.js — topic construction, header factory, validators (G13).
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
    buildTopic,
    parseTopic,
    HeaderFactory,
    isValidOrder,
    isValidInstantActions,
} from '../src/vda5050.js'

const FLEET = {
    interfaceName: 'amr',
    majorVersion: 'v2',
    manufacturer: 'cpr',
    version: '2.0.0',
}

test('buildTopic joins the five VDA5050 segments', () => {
    assert.equal(buildTopic(FLEET, 'amr001', 'order'), 'amr/v2/cpr/amr001/order')
})

test('parseTopic round-trips a built topic', () => {
    const parsed = parseTopic(buildTopic(FLEET, 'amr001', 'state'))
    assert.deepEqual(parsed, {
        interfaceName: 'amr',
        majorVersion: 'v2',
        manufacturer: 'cpr',
        serialNumber: 'amr001',
        message: 'state',
    })
})

test('parseTopic rejects a topic with the wrong segment count', () => {
    assert.equal(parseTopic('amr/v2/cpr/amr001'), null)
    assert.equal(parseTopic('amr/v2/cpr/amr001/state/extra'), null)
})

test('HeaderFactory increments headerId per topic, independently', () => {
    const hf = new HeaderFactory(FLEET, 'amr001')
    assert.equal(hf.next('state').headerId, 0)
    assert.equal(hf.next('state').headerId, 1)
    // A different topic keeps its own counter.
    assert.equal(hf.next('connection').headerId, 0)
    assert.equal(hf.next('state').headerId, 2)
})

test('HeaderFactory copies the fleet identity into the header', () => {
    const header = new HeaderFactory(FLEET, 'amr001').next('state')
    assert.equal(header.version, '2.0.0')
    assert.equal(header.manufacturer, 'cpr')
    assert.equal(header.serialNumber, 'amr001')
    assert.ok(header.timestamp)
})

test('isValidOrder accepts a structurally valid order', () => {
    assert.equal(isValidOrder({ orderId: 'o1', nodes: [] }), true)
})

test('isValidOrder rejects malformed input', () => {
    assert.equal(isValidOrder(null), false)
    assert.equal(isValidOrder({ orderId: 1, nodes: [] }), false)
    assert.equal(isValidOrder({ orderId: 'o1' }), false)
})

test('isValidInstantActions requires an actions array', () => {
    assert.equal(isValidInstantActions({ actions: [] }), true)
    assert.equal(isValidInstantActions({}), false)
    assert.equal(isValidInstantActions(null), false)
})
