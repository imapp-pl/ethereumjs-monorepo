const { ArgumentParser } = require('argparse')
const { Benchmark } = require('benchmark')
const _ = require('lodash')
const { Block } = require('@ethereumjs/block')
const { Blockchain } = require('@ethereumjs/blockchain')
const { Common, Hardfork, ConsensusType, ConsensusAlgorithm } = require('@ethereumjs/common')
const { MemoryLevel } = require('memory-level')
const { EEI } = require('@ethereumjs/vm')
const { EVM } = require('@ethereumjs/evm')
const { DefaultStateManager } = require('@ethereumjs/statemanager')
const { Address, MAX_INTEGER_BIGINT, KECCAK256_RLP_ARRAY } = require('@ethereumjs/util')

type Stats = {
  run_id?: number
  iterations_count: number
  engine_overhead_time_ns?: number
  execution_loop_time_ns?: number
  total_time_ns: number
  std_dev_time_ns: number
}

async function runBenchmark(bytecode: string): Promise<Stats> {
  /**
   * Benchmarking bytecode passed as command line argument.
   * The goal is to set up EVM to run the code as fast as possible
   * and without executing unnecessary code.
   *
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
  const db = new MemoryLevel() as any
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
  const evm = new EVM({ common, eei })

  let promiseResolve: any
  const resultPromise: Promise<Stats> = new Promise((resolve, reject) => {
    promiseResolve = resolve
  })

  const bench = new Benchmark({
    defer: true,
    name: `Running Opcodes`,
    fn: async (deferred: any) => {
      try {
        await evm.runCode({
          code: Buffer.from(bytecode, 'hex'),
          gasLimit: BigInt(0xffff),
        })
        deferred.resolve()
      } catch (err) {
        console.log('ERROR', err)
      }
    },
    onCycle: (event: any) => {
      stateManager.clearContractStorage(Address.zero())
    },
    minSamples: 1,
    // maxTime: 5,
  })
    .on('complete', () => {
      promiseResolve({
        iterations_count: bench.count,
        engine_overhead_time_ns: null,
        execution_loop_time_ns: null,
        total_time_ns: Math.round(bench.stats.mean * 1_000_000_000),
        std_dev_time_ns: Math.round(bench.stats.deviation * 1_000_000_000),
      })
    })
    .run()

  return resultPromise
}

async function runBenchmarks() {
  /**
   * Runs benchmark sampleSize times and writes results to standard output.
   * Results are structured as CSV line as expected by the measurement tool
   * which runs benchmarks from CLI.
   */

  const parser = new ArgumentParser({ description: 'Benchmark arbitrary bytecode.' })
  parser.add_argument('bytecode', { help: 'Bytecode to run', type: 'str' })
  parser.add_argument('-s', '--sampleSize', {
    help: 'Number of benchmarks to perform',
    type: 'int',
    default: 1,
  })
  let args = parser.parse_args()
  let bytecode = args.bytecode

  for (let i = 0; i < args.sampleSize; i++) {
    let results = await runBenchmark(bytecode)
    let stopCodeResults = await runBenchmark('00' + bytecode)
    results.engine_overhead_time_ns = stopCodeResults.total_time_ns
    results.execution_loop_time_ns = results.total_time_ns - stopCodeResults.total_time_ns
    results.run_id = i + 1
    const columnsOrder = [
      'run_id',
      'iterations_count',
      'engine_overhead_time_ns',
      'execution_loop_time_ns',
      'total_time_ns',
      'std_dev_time_ns',
    ]
    let row = _.at(results, columnsOrder)
    console.log(row.toString())
  }
}

runBenchmarks()
  .then(() => {
    process.exit(0)
  })
  .catch((e: Error) => {
    throw e
  })
