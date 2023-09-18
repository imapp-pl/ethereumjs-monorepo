import { ArgumentParser } from 'argparse'
import benchmark from 'benchmark'
import _ from 'lodash'
import { Dictionary } from 'lodash'
import { EVM } from '@ethereumjs/evm'
import { Address, hexToBytes } from '@ethereumjs/util'

class Stats {
  runId?: number
  iterationsCount!: number
  engineOverheadTimeNs?: number
  executionLoopTimeNs?: number
  totalTimeNs!: number
  stdDevTimeNs!: number
}

async function runBenchmark(bytecode: string): Promise<Stats> {
  /**
   * Benchmarking bytecode passed as command line argument.
   *
   * Debug loggers functions are not called if there is no DEBUG env variable set,
   * so we don't have to care about that.
   */

  const evm = new EVM()

  let promiseResolve: any
  const resultPromise: Promise<Stats> = new Promise((resolve, reject) => {
    promiseResolve = resolve
  })

  const bench = new benchmark({
    defer: true,
    maxTime: 0.5,
    name: `Running Opcodes`,
    fn: async (deferred: any) => {
      try {
        await evm.runCode({
          code: hexToBytes('0x' + bytecode),
          gasLimit: BigInt(0xffff),
        })
        deferred.resolve()
      } catch (err) {
        console.log('ERROR', err)
      }
    },
    onCycle: (event: any) => {
      evm.stateManager.clearContractStorage(Address.zero())
    },
  })
    .on('complete', () => {
      promiseResolve({
        iterationsCount: bench.count,
        engineOverheadTimeNs: null,
        executionLoopTimeNs: null,
        totalTimeNs: Math.round(bench.stats.mean * 1_000_000_000),
        stdDevTimeNs: Math.round(bench.stats.deviation * 1_000_000_000),
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
    results.engineOverheadTimeNs = stopCodeResults.totalTimeNs
    results.executionLoopTimeNs = results.totalTimeNs - stopCodeResults.totalTimeNs
    results.runId = i + 1
    const columnsOrder = [
      'runId',
      'iterationsCount',
      'engineOverheadTimeNs',
      'executionLoopTimeNs',
      'totalTimeNs',
      'stdDevTimeNs',
    ]
    let row = _.at(results as unknown as Dictionary<string>, columnsOrder)
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
