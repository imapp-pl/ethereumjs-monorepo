import { randomBytes } from '@ethereumjs/util'
import { encode } from 'jwt-simple'
import { assert, describe, it } from 'vitest'

import { METHOD_NOT_FOUND } from '../../src/rpc/error-code'

import { closeRPC, startRPC } from './helpers'

import type { TAlgorithm } from 'jwt-simple'

const request = require('superwstest')

const jwtSecret = randomBytes(32)

describe('JSON-RPC call', () => {
  it('auth protected server with valid token', () => {
    const server = startRPC({}, { wsServer: true }, { jwtSecret })
    const claims = { iat: Math.floor(new Date().getTime() / 1000) }
    const token = encode(claims, jwtSecret as never as string, 'HS256' as TAlgorithm)
    const req = {
      jsonrpc: '2.0',
      method: 'METHOD_DOES_NOT_EXIST',
      params: ['0x1', true],
      id: 1,
    }

    const testFn = async () => {
      try {
        await request(server)
          .ws('/')
          .set('Authorization', `Bearer ${token}`)
          .sendJson(req)
          .expectJson((res: any) => res.error.code === METHOD_NOT_FOUND)
          .close()
          .expectClosed()
        assert.ok(true)
      } catch (err) {
        assert.notOk(err)
      } finally {
        closeRPC(server)
      }
    }
    server.listen(0, 'localhost', testFn)
  })

  it('auth protected server without any auth headers', () => {
    const server = startRPC({}, { wsServer: true }, { jwtSecret })
    const testFn = async () => {
      try {
        await request(server).ws('/').expectConnectionError(401)
        assert.ok(true)
      } catch (err) {
        assert.notOk(err)
      } finally {
        closeRPC(server)
      }
    }
    server.listen(0, 'localhost', testFn)
  })

  it('server without any auth headers', () => {
    const server = startRPC({}, { wsServer: true })
    const req = {
      jsonrpc: '2.0',
      method: 'METHOD_DOES_NOT_EXIST',
      params: ['0x1', true],
      id: 1,
    }

    const testFn = async () => {
      try {
        await request(server)
          .ws('/')
          .sendJson(req)
          .expectJson((res: any) => res.error.code === METHOD_NOT_FOUND)
          .close()
          .expectClosed()
        assert.ok(true)
      } catch (err) {
        assert.notOk(err)
      } finally {
        closeRPC(server)
      }
    }
    server.listen(0, 'localhost', testFn)
  })
})
