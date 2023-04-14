import { readFileSync } from 'fs'
import * as Benchmark from 'benchmark'
import { Block } from '../../block/dist'
import { Blockchain } from '../../blockchain/dist'
import { Common, Hardfork, ConsensusType, ConsensusAlgorithm } from '../../common/dist'
import { MemoryLevel } from 'memory-level'
import { EEI } from '../../vm/dist'
import { EVM, EVMInterface } from '../dist'
import { DefaultStateManager } from '../../statemanager/dist'
import { Address, MAX_INTEGER_BIGINT, KECCAK256_RLP_ARRAY } from '../../util/dist'

// TODO: write a test that goes through all opcodes
//  and checks which of them leave something on the stack

const OPCODES_FIXTURE = 'benchmarks/fixture/opcodes.json'

const run = async (evm: EVMInterface, opcodes: string) => {
  await evm.runCode({
    code: Buffer.from(opcodes, 'hex'),
    gasLimit: BigInt(0xffff),
  })
}

export async function sampleOpcodes(suite?: Benchmark.Suite) {
  let data = JSON.parse(readFileSync(OPCODES_FIXTURE, 'utf8'))

  /**
   * Debug loggers functions are not called if there is no DEBUG env variable set,
   * so we don't have to care about that.
   */

  const common = Common.custom({
    chainId: 1234,
    networkId: 1234,
    defaultHardfork: Hardfork.Shanghai,
    consensus: {
      type: ConsensusType.ProofOfStake,
      algorithm: ConsensusAlgorithm.Casper,
    },
    genesis: {
      gasLimit: 10000000000,
      difficulty: 0,
      nonce: '0x0000000000000000',
      extraData: '0x0',
    },
    comment: 'Custom empty chain for benchmarks',
    bootstrapNodes: [],
    dnsNetworks: [],
  })
  const stateManager = new DefaultStateManager() //Creates in memory MapDB
  const db = new MemoryLevel()
  const blockData = {
    header: {
      parentHash: '0x000000000000000000000000000000000000000000000000000000000000000',
      uncleHash: KECCAK256_RLP_ARRAY,
      coinbase: Address.zero(),
      difficulty: BigInt(0),
      gasLimit: MAX_INTEGER_BIGINT,
      timestamp: BigInt(1681414351),
      extraData: '0x0',
    },
  }
  const genesisBlock = Block.fromBlockData(blockData)
  const blockchain = await Blockchain.create({ common, db, genesisBlock })
  const eei = new EEI(stateManager, common, blockchain)

  // console.log(common)
  // console.log(stateManager)
  // console.log(blockchain)
  // console.log(await blockchain.getBlock(0))

  const evm = new EVM({ common, eei })
  //TODO: tego nie jestem pewny, podejrzeć w testach takie użycie
  // evm._common.genesis().stateRoot = stateManager._trie.root

  for (const opcodes of data) {
    const evmCopy = evm.copy()

    let z = await evmCopy.runCode({
      code: Buffer.from(opcodes, 'hex'),
      gasLimit: BigInt(0xffff),
    })
    if (z.runState.stack._store.length > 0) {
      console.log(opcodes, z.runState.stack._store)
      console.log('XXXXXXXXXXXXXXx')
    }

    if (suite) {
      suite.add({
        name: `Running Opcode: ${opcodes}`,
        fn: async () => {
          await run(evmCopy, opcodes)
        },
      })
    } else {
      await run(evmCopy, opcodes)
    }
  }
}
