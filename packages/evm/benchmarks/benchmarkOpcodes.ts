const { ArgumentParser } = require('argparse')
import Benchmark = require('benchmark')
import { Block } from '../../block/dist'
import { Blockchain } from '../../blockchain/dist'
import { Common, Hardfork, ConsensusType, ConsensusAlgorithm } from '../../common/dist'
import { MemoryLevel } from 'memory-level'
import { EEI } from '../../vm/dist'
import { EVM, EVMInterface } from '../dist'
import { DefaultStateManager } from '../../statemanager/dist'
import { Address, MAX_INTEGER_BIGINT, KECCAK256_RLP_ARRAY } from '../../util/dist'

export async function main() {
  const parser = new ArgumentParser({ description: 'Benchmark arbitrary bytecode.' })
  parser.add_argument('bytecode', { help: 'Bytecode to run', type: 'str' })
  parser.add_argument('-s', '--sampleSize', {
    help: 'Number of benchmarks to perform',
    type: 'int',
    default: 1,
  })
  let args = parser.parse_args()
  let opcodes = args.bytecode

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

  const initEvm = new EVM({ common, eei })
  //TODO: tego nie jestem pewny, podejrzeć w testach takie użycie
  // evm._common.genesis().stateRoot = stateManager._trie.root

  let evm = initEvm.copy()

  const bench = new Benchmark({
    name: `Running Opcodes`,
    fn: async () => {
      let results = await evm.runCode({
        code: Buffer.from(opcodes, 'hex'),
        gasLimit: BigInt(0xffff),
      })
      console.log(results.executionGasUsed.toString())
    },
    // onCycle: (event: Benchmark.Event) => {
    //   // console.log(event)
    //   // console.log(String(event.target))
    //   evm = initEvm.copy()
    // },
    minSamples: 1,
    maxTime: 5,
  })
  bench.run()
  console.log(bench)
  const memoryData = process.memoryUsage()
  const formatMemoryUsage = (data: number) => `${Math.round((data / 1024 / 1024) * 100) / 100} MB`
  const memoryUsage = {
    rss: `${formatMemoryUsage(
      memoryData.rss
    )} -> Resident Set Size - total memory allocated for the process execution`,
    heapTotal: `${formatMemoryUsage(memoryData.heapTotal)} -> total size of the allocated heap`,
    heapUsed: `${formatMemoryUsage(
      memoryData.heapUsed
    )} -> actual memory used during the execution`,
    external: `${formatMemoryUsage(memoryData.external)} -> V8 external memory`,
  }
  console.log(memoryUsage)
}

main()
  .then(() => {
    console.log('Benchmark run finished.')
    process.exit(0)
  })
  .catch((e: Error) => {
    throw e
  })
