import { Block } from '@ethereumjs/block'
import { Blockchain } from '@ethereumjs/blockchain'
import { Chain, Common, Hardfork } from '@ethereumjs/common'
import { getGenesis } from '@ethereumjs/genesis'
import { LegacyTransaction } from '@ethereumjs/tx'
import { Address, bigIntToHex } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { INVALID_PARAMS } from '../../../src/rpc/error-code'
import { baseRequest, createClient, createManager, params, startRPC } from '../helpers'
import { checkError } from '../util'

import type { FullEthereumService } from '../../../src/service'

const method = 'eth_getBalance'

describe(
  method,
  () => {
    it('ensure balance deducts after a tx', async () => {
      const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Istanbul })
      const blockchain = await Blockchain.create({ common })

      const client = createClient({ blockchain, commonChain: common, includeVM: true })
      const manager = createManager(client)

      const server = startRPC(manager.getMethods())

      const { execution } = client.services.find((s) => s.name === 'eth') as FullEthereumService
      assert.notEqual(execution, undefined, 'should have valid execution')
      const { vm } = execution

      // since synchronizer.run() is not executed in the mock setup,
      // manually run stateManager.generateCanonicalGenesis()
      await vm.stateManager.generateCanonicalGenesis(getGenesis(1))

      // genesis address with balance
      const address = Address.fromString('0xccfd725760a68823ff1e062f4cc97e1360e8d997')

      // verify balance is genesis amount
      const genesisBalance = BigInt(0x15ac56edc4d12c0000)
      let req = params(method, [address.toString(), 'latest'])
      let expectRes = (res: any) => {
        const msg = 'should return the correct genesis balance'
        assert.equal(res.body.result, bigIntToHex(genesisBalance), msg)
      }
      await baseRequest(server, req, 200, expectRes, false)

      // construct block with tx
      const tx = LegacyTransaction.fromTxData({ gasLimit: 53000 }, { common, freeze: false })
      tx.getSenderAddress = () => {
        return address
      }
      const block = Block.fromBlockData({}, { common })
      block.transactions[0] = tx

      const result = await vm.runBlock({ block, generate: true, skipBlockValidation: true })
      const { amountSpent } = result.results[0]

      // verify balance is genesis amount minus amountSpent
      const expectedNewBalance = genesisBalance - amountSpent
      req = params(method, [address.toString(), 'latest'])
      expectRes = (res: any) => {
        const msg = 'should return the correct balance after a tx'
        assert.equal(res.body.result, bigIntToHex(expectedNewBalance), msg)
      }
      await baseRequest(server, req, 200, expectRes, false)

      // verify we can query with "earliest"
      req = params(method, [address.toString(), 'earliest'])
      expectRes = (res: any) => {
        const msg = "should return the correct balance with 'earliest'"
        assert.equal(res.body.result, bigIntToHex(genesisBalance), msg)
      }
      await baseRequest(server, req, 200, expectRes, false)

      // verify we can query with a past block number
      req = params(method, [address.toString(), '0x0'])
      expectRes = (res: any) => {
        const msg = 'should return the correct balance with a past block number'
        assert.equal(res.body.result, bigIntToHex(genesisBalance), msg)
      }
      await baseRequest(server, req, 200, expectRes, false)

      // call with height that exceeds chain height
      req = params(method, [address.toString(), '0x1'])
      expectRes = checkError(INVALID_PARAMS, 'specified block greater than current height')
      await baseRequest(server, req, 200, expectRes, false)

      // call with nonexistent account
      req = params(method, [`0x${'11'.repeat(20)}`, 'latest'])
      expectRes = (res: any) => {
        const msg = 'should return 0x0 for nonexistent account'
        assert.equal(res.body.result, `0x0`, msg)
      }
      await baseRequest(server, req, 200, expectRes)
    })

    it('call with unsupported block argument', async () => {
      const blockchain = await Blockchain.create()

      const client = createClient({ blockchain, includeVM: true })
      const manager = createManager(client)
      const server = startRPC(manager.getMethods())

      const req = params(method, ['0xccfd725760a68823ff1e062f4cc97e1360e8d997', 'pending'])
      const expectRes = checkError(INVALID_PARAMS, '"pending" is not yet supported')
      await baseRequest(server, req, 200, expectRes)
    })
  },
  30000
)
