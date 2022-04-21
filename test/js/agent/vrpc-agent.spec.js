'use strict'

/* global describe, context, before, after, it */
const { VrpcAgent } = require('../../../index')
const assert = require('assert')
const sinon = require('sinon')

describe('vrpc-agent', () => {
  /*******************************
   * construction and connection *
   *******************************/
  describe('construction and connection', () => {
    it('should not construct using bad parameters', async () => {
      assert.throws(
        () => new VrpcAgent({ broker: 'mqtt://doesNotWork:1883', domain: null }),
        {
          message: 'The domain must be specified'
        }
      )
      assert.throws(
        () => new VrpcAgent({
          broker: 'mqtt://doesNotWork:1883',
          domain: '*'
        }),
        {
          message: 'The domain must NOT contain any of those characters: "+", "/", "#", "*"'
        }
      )
      assert.throws(
        () => new VrpcAgent({
          broker: 'mqtt://doesNotWork:1883',
          domain: 'a/b'
        }),
        {
          message: 'The domain must NOT contain any of those characters: "+", "/", "#", "*"'
        }
      )
    })
    it('should not connect when constructed using bad broker', async () => {
      const offlineSpy = sinon.spy()
      const reconnectSpy = sinon.spy()
      const agent = new VrpcAgent({
        broker: 'mqtt://doesNotWork:1883',
        domain: 'test.vrpc',
        agent: 'agent1'
      })
      agent.on('offline', offlineSpy)
      agent.on('reconnect', reconnectSpy)
      agent.on('reconnect', () => agent.end())
      await agent.serve()
      assert(offlineSpy.calledOnce)
      assert(reconnectSpy.calledOnce)
    })
    it('should not connect when access is denied as of wrong credentials', async () => {
      const errorSpy = sinon.spy()
      const reconnectSpy = sinon.spy()
      const agent = new VrpcAgent({
        broker: 'mqtt://broker:1883',
        domain: 'test.vrpc',
        agent: 'agent1',
        username: 'does',
        password: 'not exist'
      })
      agent.on('error', errorSpy)
      agent.on('reconnect', reconnectSpy)
      agent.on('reconnect', () => agent.end())
      await agent.serve()
      assert.strictEqual(errorSpy.args[0][0].message, 'Connection refused: Not authorized')
      assert(reconnectSpy.calledOnce)
    })
    context('when constructed using good parameters and broker', () => {
      let agent
      it('should connect', async () => {
        const errorSpy = sinon.spy()
        const reconnectSpy = sinon.spy()
        const connectSpy = sinon.spy()
        agent = new VrpcAgent({
          broker: 'mqtt://broker:1883',
          domain: 'test.vrpc',
          agent: 'agent1',
          username: 'Erwin',
          password: '12345'
        })
        agent.on('error', errorSpy)
        agent.on('reconnect', reconnectSpy)
        agent.on('connect', connectSpy)
        await agent.serve()
        assert(errorSpy.notCalled)
        assert(reconnectSpy.notCalled)
        assert(connectSpy.calledOnce)
      })
      it('should end', async () => {
        await agent.end()
      })
    })

    context('when dealing with failed subscribe calls', () => {
      const mockSubscribeFunction = (topic, options, callback) => {
        const topicArray = Array.isArray(topic) ? topic : [topic]
        const resultArray = topicArray.map(x => {
          return {
            topic: x,
            qos: (options.outputQos === undefined) ? options.qos : options.outputQos
          }
        })
        callback(null, resultArray)
      }
      const agent = new VrpcAgent({
        username: 'does',
        password: 'not exist',
        bestEffort: false
      })
      // Install a mock mqtt client object
      agent._client = {
        subscribe: mockSubscribeFunction
      }
      it('should correctly report error on subscribe with qos=128', () => {
        const errorSpy = sinon.spy()
        agent.on('error', errorSpy)

        agent._mqttSubscribe('foo')
        assert(errorSpy.notCalled) // all fine

        agent._mqttSubscribe(['foo', 'bar'])
        assert(errorSpy.notCalled) // all fine

        // now mock a failed subscription
        agent._mqttSubscribe('foo', { outputQos: 128 })
        assert.strictEqual(errorSpy.args[0][0].code, 'SUBSCRIBE_FAILED')
        assert.strictEqual(errorSpy.args[0][0].message, 'Could not subscribe all 1 topic(s) but got error qos=128 on following 1 topic(s): foo')

        agent.off('error', errorSpy)
      })
      it('should correctly report error on subscribe where qos=0 is returned', () => {
        const errorSpy = sinon.spy()
        agent.on('error', errorSpy)

        // and now mock a subscription with reduced qos
        agent._mqttSubscribe('foo', { outputQos: 0 })
        assert.strictEqual(errorSpy.args[0][0].code, 'SUBSCRIBE_REDUCED_QOS')
        assert.strictEqual(errorSpy.args[0][0].message, 'Could not subscribe all 1 topic(s) at desired qos=1 but got reduced qos on following 1 topic(s): [{"topic":"foo","qos":0}]')

        agent.off('error', errorSpy)
      })
      it('should correctly not report error on subscribe with qos=0 if bestEffort=true', () => {
        const bestEffortAgent = new VrpcAgent({
          username: 'does',
          password: 'not exist',
          bestEffort: true // now with "true" here
        })
        // Install a mock mqtt client object
        bestEffortAgent._client = {
          subscribe: mockSubscribeFunction
        }
        const errorSpy = sinon.spy()
        bestEffortAgent.on('error', errorSpy)

        // and now mock a subscription with qos=0 but this is also intended
        bestEffortAgent._mqttSubscribe('foo', { outputQos: 0 })
        assert(errorSpy.notCalled) // all fine
      })
    })
  })
})
