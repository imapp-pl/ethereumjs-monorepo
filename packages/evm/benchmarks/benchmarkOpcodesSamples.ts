import { ArgumentParser } from 'argparse'
import benchmark from 'benchmark'
import _ from 'lodash'
import { Dictionary } from 'lodash'
import { EVM } from '@ethereumjs/evm'
import { Address, hexToBytes } from '@ethereumjs/util'

async function runBenchmark(bytecode: string, sampleSize: number): Promise<number[]> {
  /**
   * Benchmarking bytecode passed as command line argument.
   *
   * Debug loggers functions are not called if there is no DEBUG env variable set,
   * so we don't have to care about that.
   */

  const evm = new EVM()

  let promiseResolve: any
  const resultPromise: Promise<number[]> = new Promise((resolve, reject) => {
    promiseResolve = resolve
  })

  const bench = new benchmark({
    defer: true,
    maxTime: 0.5,
    minSamples: sampleSize,
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
      promiseResolve(bench.stats.sample)
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

  let results = await runBenchmark(bytecode, args.sampleSize)
  for (let i = 0; i < args.sampleSize; i++) {
    const j = Math.floor((i * results.length) / args.sampleSize)
    console.log(Math.round(results[j] * 1_000_000_000))
  }
}

runBenchmarks()
  .then(() => {
    process.exit(0)
  })
  .catch((e: Error) => {
    throw e
  })
