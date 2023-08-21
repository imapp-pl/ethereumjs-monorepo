import { FeeMarketEIP1559Transaction, LegacyTransaction } from '@ethereumjs/tx'
import { bytesToHex } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import pow from '../../testdata/geth-genesis/pow.json'
import {
  baseRequest,
  dummy,
  gethGenesisStartLondon,
  params,
  runBlockWithTxs,
  setupChain,
} from '../helpers'

const method = 'eth_getTransactionByHash'

describe(method, () => {
  it('call with legacy tx', async () => {
    const { chain, common, execution, server } = await setupChain(pow, 'pow', { txLookupLimit: 1 })

    // construct tx
    const tx = LegacyTransaction.fromTxData(
      { gasLimit: 2000000, gasPrice: 100, to: '0x0000000000000000000000000000000000000000' },
      { common }
    ).sign(dummy.privKey)

    await runBlockWithTxs(chain, execution, [tx])

    // get the tx
    let req = params(method, [bytesToHex(tx.hash())])
    let expectRes = (res: any) => {
      const msg = 'should return the correct tx'
      assert.equal(res.body.result.hash, bytesToHex(tx.hash()), msg)
    }
    await baseRequest(server, req, 200, expectRes, false, false)

    // run a block to ensure tx hash index is cleaned up when txLookupLimit=1
    await runBlockWithTxs(chain, execution, [])
    req = params(method, [bytesToHex(tx.hash())])
    expectRes = (res: any) => {
      const msg = 'should return null when past txLookupLimit'
      assert.equal(res.body.result, null, msg)
    }
    await baseRequest(server, req, 200, expectRes, true) // pass endOnFinish=true for last test
  })

  it('call with 1559 tx', async () => {
    const { chain, common, execution, server } = await setupChain(
      gethGenesisStartLondon(pow),
      'powLondon',
      { txLookupLimit: 0 }
    )

    // construct tx
    const tx = FeeMarketEIP1559Transaction.fromTxData(
      {
        gasLimit: 2000000,
        maxFeePerGas: 975000000,
        maxPriorityFeePerGas: 10,
        to: '0x0000000000000000000000000000000000000000',
      },
      { common }
    ).sign(dummy.privKey)

    await runBlockWithTxs(chain, execution, [tx])

    // get the tx
    let req = params(method, [bytesToHex(tx.hash())])
    let expectRes = (res: any) => {
      const msg = 'should return the correct tx type'
      assert.equal(res.body.result.type, '0x2', msg)
    }
    await baseRequest(server, req, 200, expectRes, false)

    // run some blocks to ensure tx hash index is not cleaned up when txLookupLimit=0
    await runBlockWithTxs(chain, execution, [])
    await runBlockWithTxs(chain, execution, [])
    await runBlockWithTxs(chain, execution, [])
    req = params(method, [bytesToHex(tx.hash())])
    expectRes = (res: any) => {
      const msg = 'should return the correct tx when txLookupLimit=0'
      assert.equal(res.body.result.hash, bytesToHex(tx.hash()), msg)
    }
    await baseRequest(server, req, 200, expectRes, true) // pass endOnFinish=true for last test
  })

  it('call with unknown tx hash', async () => {
    const { server } = await setupChain(pow, 'pow')

    // get a random tx hash
    const req = params(method, [
      '0x89ea5b54111befb936851660a72b686a21bc2fc4889a9a308196ff99d08925a0',
    ])
    const expectRes = (res: any) => {
      const msg = 'should return null'
      assert.equal(res.body.result, null, msg)
    }
    await baseRequest(server, req, 200, expectRes)
  })
})
