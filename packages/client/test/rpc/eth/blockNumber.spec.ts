import { bigIntToHex } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { baseRequest, createClient, createManager, params, startRPC } from '../helpers'

const method = 'eth_blockNumber'

describe(method, () => {
  it('call with valid arguments', async () => {
    const mockBlockNumber = BigInt(123)
    const mockChain = {
      headers: { latest: { number: mockBlockNumber } },
      async getCanonicalHeadHeader(): Promise<any> {
        return {
          number: mockBlockNumber,
        }
      },
    }
    const manager = createManager(createClient({ chain: mockChain }))
    const server = startRPC(manager.getMethods())

    const req = params(method)
    const expectRes = (res: any) => {
      assert.equal(res.body.result, bigIntToHex(mockBlockNumber))
    }
    await baseRequest(server, req, 200, expectRes)
  })
})
