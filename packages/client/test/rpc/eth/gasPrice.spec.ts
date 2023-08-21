import { FeeMarketEIP1559Transaction, LegacyTransaction } from '@ethereumjs/tx'
import { bigIntToHex, intToHex } from '@ethereumjs/util'
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

const method = 'eth_gasPrice'

describe(method, () => {
  it('call with legacy transaction data', async () => {
    const { chain, common, execution, server } = await setupChain(pow, 'pow')

    const GAS_PRICE = 100
    // construct tx
    const tx = LegacyTransaction.fromTxData(
      { gasLimit: 21000, gasPrice: GAS_PRICE, to: '0x0000000000000000000000000000000000000000' },
      { common }
    ).sign(dummy.privKey)

    await runBlockWithTxs(chain, execution, [tx])

    const req = params(method, [])
    const expectRes = (res: any) => {
      const msg = 'should return the correct suggested gas price with 1 legacy transaction'
      assert.equal(res.body.result, intToHex(GAS_PRICE), msg)
    }
    await baseRequest(server, req, 200, expectRes)
  })

  it('call with multiple legacy transactions', async () => {
    const { chain, common, execution, server } = await setupChain(pow, 'pow')
    const iterations = BigInt(20)
    let averageGasPrice = BigInt(0)
    for (let i = 0; i < iterations; i++) {
      const gasPrice = i * 100
      averageGasPrice += BigInt(gasPrice)
      const tx = LegacyTransaction.fromTxData(
        { nonce: i, gasLimit: 21000, gasPrice, to: '0x0000000000000000000000000000000000000000' },
        { common }
      ).sign(dummy.privKey)
      await runBlockWithTxs(chain, execution, [tx])
    }

    averageGasPrice = averageGasPrice / iterations
    const req = params(method, [])
    const expectRes = (res: any) => {
      const msg = 'should return the correct gas price with multiple legacy transactions'
      assert.equal(res.body.result, bigIntToHex(averageGasPrice), msg)
    }
    await baseRequest(server, req, 200, expectRes)
  })

  it('call with multiple legacy transactions in a single block', async () => {
    const { chain, common, execution, server } = await setupChain(pow, 'pow')

    const G1 = 100
    const G2 = 1231231

    const tx1 = LegacyTransaction.fromTxData(
      { gasLimit: 21000, gasPrice: G1, to: '0x0000000000000000000000000000000000000000' },
      { common }
    ).sign(dummy.privKey)
    const tx2 = LegacyTransaction.fromTxData(
      { nonce: 1, gasLimit: 21000, gasPrice: G2, to: '0x0000000000000000000000000000000000000000' },
      { common }
    ).sign(dummy.privKey)

    await runBlockWithTxs(chain, execution, [tx1, tx2])

    const averageGasPrice = (G1 + G2) / 2
    const req = params(method, [])
    const expectRes = (res: any) => {
      const msg = 'should return the correct gas price with multiple legacy transactions in a block'
      assert.equal(res.body.result, intToHex(Math.trunc(averageGasPrice)), msg)
    }
    await baseRequest(server, req, 200, () => expectRes)
  })

  it('call with 1559 transaction data', async () => {
    const { chain, common, execution, server } = await setupChain(
      gethGenesisStartLondon(pow),
      'powLondon'
    )

    const tx = FeeMarketEIP1559Transaction.fromTxData(
      {
        gasLimit: 21000,
        maxPriorityFeePerGas: 10,
        maxFeePerGas: 975000000,
        to: '0x0000000000000000000000000000000000000000',
      },
      { common }
    ).sign(dummy.privKey)

    await runBlockWithTxs(chain, execution, [tx])
    const req = params(method, [])
    const latest = await chain.getCanonicalHeadHeader()
    const baseFee = latest.calcNextBaseFee()
    const gasPrice = BigInt(baseFee + tx.maxPriorityFeePerGas)

    const expectRes = (res: any) => {
      const msg = 'should return the correct gas price with 1 1559 transaction'
      assert.equal(res.body.result, bigIntToHex(gasPrice), msg)
    }
    await baseRequest(server, req, 200, expectRes)
  })

  it('call with multiple 1559 transactions', async () => {
    const { chain, common, execution, server } = await setupChain(
      gethGenesisStartLondon(pow),
      'powLondon'
    )

    const maxPriority1 = 10
    const maxPriority2 = 1231231
    const tx1 = FeeMarketEIP1559Transaction.fromTxData(
      {
        gasLimit: 21000,
        maxPriorityFeePerGas: maxPriority1,
        maxFeePerGas: 975000000,
        to: '0x0000000000000000000000000000000000000000',
      },
      { common }
    ).sign(dummy.privKey)
    const tx2 = FeeMarketEIP1559Transaction.fromTxData(
      {
        nonce: 1,
        gasLimit: 21000,
        maxPriorityFeePerGas: maxPriority2,
        maxFeePerGas: 975000000,
        to: '0x0000000000000000000000000000000000000000',
      },
      { common }
    ).sign(dummy.privKey)

    await runBlockWithTxs(chain, execution, [tx1, tx2])
    const req = params(method, [])
    const averagePriorityFee = BigInt(Math.trunc((maxPriority1 + maxPriority2) / 2))
    const latest = await chain.getCanonicalHeadHeader()
    const baseFee = latest.calcNextBaseFee()
    const gasPrice = BigInt(baseFee + averagePriorityFee)
    const expectRes = (res: any) => {
      const msg = 'should return the correct gas price with 1 1559 transaction'
      assert.equal(res.body.result, bigIntToHex(gasPrice), msg)
    }
    await baseRequest(server, req, 200, expectRes)
  })

  it('compute average gas price for 21 blocks', async () => {
    const { chain, common, execution, server } = await setupChain(pow, 'pow')
    const iterations = BigInt(21)
    const gasPrice = BigInt(20)
    const firstBlockGasPrice = BigInt(11111111111111)
    let tx: LegacyTransaction
    for (let i = 0; i < iterations; i++) {
      if (i === 0) {
        tx = LegacyTransaction.fromTxData(
          {
            nonce: i,
            gasLimit: 21000,
            gasPrice: firstBlockGasPrice,
            to: '0x0000000000000000000000000000000000000000',
          },
          { common }
        ).sign(dummy.privKey)
      } else {
        tx = LegacyTransaction.fromTxData(
          {
            nonce: i,
            gasLimit: 21000,
            gasPrice,
            to: '0x0000000000000000000000000000000000000000',
          },
          { common }
        ).sign(dummy.privKey)
      }
      await runBlockWithTxs(chain, execution, [tx!])
    }

    const latest = await chain.getCanonicalHeadHeader()
    const blockNumber = latest.number

    // Should be block number 21
    assert.equal(blockNumber, 21n)

    const req = params(method, [])
    const expectRes = (res: any) => {
      const msg = 'should return the correct gas price for 21 blocks'
      assert.equal(res.body.result, bigIntToHex(gasPrice), msg)
    }

    await baseRequest(server, req, 200, expectRes)
  })
})
