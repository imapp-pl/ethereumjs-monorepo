import { BlockHeader } from '@ethereumjs/block'
import { Common } from '@ethereumjs/common'
import { assert, describe, it, vi } from 'vitest'

import { Event } from '../../src/types'
import genesisJSON from '../testdata/geth-genesis/post-merge.json'

import { destroy, setup, wait } from './util'

describe('[Integration:BeaconSync]', () => {
  const common = Common.fromGethGenesis(genesisJSON, { chain: 'post-merge' })
  common.setHardforkBy({ blockNumber: BigInt(0), td: BigInt(0) })

  it('should sync blocks', async () => {
    BlockHeader.prototype['_consensusFormatValidation'] = vi.fn()
    vi.doMock('@ethereumjs/block', () => {
      {
        BlockHeader
      }
    })

    const [remoteServer, remoteService] = await setup({ location: '127.0.0.2', height: 20, common })
    const [localServer, localService] = await setup({ location: '127.0.0.1', height: 0, common })
    const next = await remoteService.chain.getCanonicalHeadHeader()
    ;(localService.synchronizer as any).skeleton.status.progress.subchains = [
      {
        head: BigInt(21),
        tail: BigInt(21),
        next: next.hash(),
      },
    ]
    await localService.synchronizer!.stop()
    await localServer.discover('remotePeer1', '127.0.0.2')
    localService.config.events.on(Event.SYNC_SYNCHRONIZED, async () => {
      assert.equal(localService.chain.blocks.height, BigInt(20), 'synced')
      await destroy(localServer, localService)
      await destroy(remoteServer, remoteService)
    })
    await localService.synchronizer!.start()
  })

  it('should not sync with stale peers', async () => {
    const [remoteServer, remoteService] = await setup({ location: '127.0.0.2', height: 9, common })
    const [localServer, localService] = await setup({ location: '127.0.0.1', height: 10, common })
    localService.config.events.on(Event.SYNC_SYNCHRONIZED, async () => {
      assert.fail('synced with a stale peer')
    })
    await localServer.discover('remotePeer', '127.0.0.2')
    await wait(300)
    await destroy(localServer, localService)
    await destroy(remoteServer, remoteService)
    assert.ok(true, 'did not sync')
  })

  it('should sync with best peer', async () => {
    const [remoteServer1, remoteService1] = await setup({
      location: '127.0.0.2',
      height: 7,
      common,
    })
    const [remoteServer2, remoteService2] = await setup({
      location: '127.0.0.3',
      height: 10,
      common,
    })
    const [localServer, localService] = await setup({
      location: '127.0.0.1',
      height: 0,
      common,
      minPeers: 2,
    })
    ;(localService.synchronizer as any).skeleton.status.progress.subchains = [
      {
        head: BigInt(11),
        tail: BigInt(11),
        next: (await remoteService2.chain.getCanonicalHeadHeader()).hash(),
      },
    ]
    localService.interval = 1000
    await localService.synchronizer!.stop()
    await localServer.discover('remotePeer1', '127.0.0.2')
    await localServer.discover('remotePeer2', '127.0.0.3')

    localService.config.events.on(Event.SYNC_SYNCHRONIZED, async () => {
      if (localService.chain.blocks.height === BigInt(10)) {
        assert.ok(true, 'synced with best peer')
        await destroy(localServer, localService)
        await destroy(remoteServer1, remoteService1)
        await destroy(remoteServer2, remoteService2)
      }
    })
    await localService.synchronizer!.start()
  })
}, 60000)
