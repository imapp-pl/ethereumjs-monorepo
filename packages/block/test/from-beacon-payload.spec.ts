import { Common, Hardfork } from '@ethereumjs/common'
import { assert, describe, it } from 'vitest'

import * as shardingJson from '../../client/test/sim/configs/4844-devnet.json'
import { Block, BlockHeader } from '../src/index.js'

import * as payload87335 from './testdata/payload-slot-87335.json'
import * as payload87475 from './testdata/payload-slot-87475.json'

describe('[fromExecutionPayloadJson]: 4844 devnet 5', () => {
  const network = 'sharding'

  // safely change chainId without modifying undelying json
  const commonJson = { ...shardingJson }
  commonJson.config = { ...commonJson.config, chainId: 4844001005 }
  const common = Common.fromGethGenesis(commonJson, { chain: network })
  common.setHardfork(Hardfork.Cancun)

  it('reconstruct cancun block with blob txs', async () => {
    for (const payload of [payload87335, payload87475]) {
      try {
        const block = await Block.fromBeaconPayloadJson(payload, { common })
        const parentHeader = BlockHeader.fromHeaderData(
          { excessBlobGas: BigInt(0), blobGasUsed: block.header.excessBlobGas! + BigInt(393216) },
          { common }
        )
        block.validateBlobTransactions(parentHeader)
        assert.ok(true, `successfully constructed block=${block.header.number}`)
      } catch (e) {
        assert.fail(`failed to construct block, error: ${e}`)
      }
    }
  })

  it('should validate block hash', async () => {
    try {
      // construct a payload with differing block hash
      await Block.fromBeaconPayloadJson(
        { ...payload87335, block_hash: payload87475.block_hash },
        { common }
      )
      assert.fail(`should have failed constructing the block`)
    } catch (e) {
      assert.ok(true, `correctly failed constructing block, error: ${e}`)
      assert.ok(`${e}`.includes('Invalid blockHash'), 'failed with correct error')
    }
  })

  it('should validate excess blob gas', async () => {
    try {
      // construct a payload with a different excess blob gas but matching hash
      const block = await Block.fromBeaconPayloadJson(
        {
          ...payload87475,
          block_hash: '0x573714bdd0ca5e47bc32008751c4fc74237f8cb354fbc1475c1d0ece38236ea4',
        },
        { common }
      )
      const parentHeader = BlockHeader.fromHeaderData({ excessBlobGas: BigInt(0) }, { common })
      block.validateBlobTransactions(parentHeader)
      assert.fail(`should have failed constructing the block`)
    } catch (e) {
      assert.ok(true, `correctly failed constructing block, error: ${e}`)
      assert.ok(`${e}`.includes('block excessBlobGas mismatch'), 'failed with correct error')
    }
  })
})
