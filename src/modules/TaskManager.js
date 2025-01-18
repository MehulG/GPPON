import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import { pipe } from 'it-pipe'
import * as uint8arrays from 'uint8arrays'
import { peerIdFromString } from '@libp2p/peer-id';
import { TaskState } from './states/taskState.js'
import { TaskProposal } from './proposals/taskProposal.js'
import { TASK_PROTOCOLS } from './protocols/taskProtocols.js';
import runDocker from './run_docker.js';
import { handleAcceptance, handleProposal, handleLockRequest, handleProtocol, handleResult, handleStatusUpdate, handleUnlockRequest, handleFileReception } from './HandleProposal.js';
import { TaskUtility } from './TaskUtility.js';

class TaskManager extends EventEmitter {
    constructor(node) {
        super()
        this.node = node
        this.proposals = new Map()  // id -> TaskProposal
        this.activeTasks = new Map()  // id -> TaskInfo
        this.capabilities = {
            cpu: 4,  // Default available CPU cores
            memory: 8192,  // Default available memory (MB)
            bandwidth: 100,  // Default bandwidth (Mbps)
            storage: 100  // Default storage (GB)
        }
        this.lockTimeout = 5000  // Lock timeout in ms
        this.maxConcurrentTasks = 5
        this.setupProtocols()
    }

    async setupProtocols() {
        this.node.node.handle('/gppon/task/propose/1.0.0', handleProtocol.bind(this, handleProposal.bind(this)))
        this.node.node.handle('/gppon/task/accept/1.0.0', handleProtocol.bind(this, handleAcceptance.bind(this)))
        this.node.node.handle('/gppon/task/status/1.0.0', handleProtocol.bind(this, handleStatusUpdate.bind(this)))
        this.node.node.handle('/gppon/task/result/1.0.0', handleProtocol.bind(this, handleResult.bind(this)))
        this.node.node.handle('/gppon/task/lock/1.0.0', handleProtocol.bind(this, handleLockRequest.bind(this)))
        this.node.node.handle('/gppon/task/unlock/1.0.0', handleProtocol.bind(this, handleUnlockRequest.bind(this)))
        this.node.node.handle('/gppon/task/file/1.0.0', handleProtocol.bind(this, handleFileReception.bind(this)))
    }

    async broadcastProposal(proposal) {
        const message = {
            type: 'TASK_PROPOSAL',
            payload: proposal,
            timestamp: Date.now()
        }

        const peers = await this.node.node.peerStore.all()
        const messageData = new TextEncoder().encode(JSON.stringify(message))

        const results = await Promise.allSettled(
            peers.map(async peer => {
                try {
                    // Dial the peer
                    const stream = await this.node.node.dialProtocol(peer.id, '/gppon/task/propose/1.0.0')

                    // Send the proposal
                    await pipe([messageData], stream.sink)

                    // Collect response data
                    let responseData = new Uint8Array()
                    for await (const chunk of stream.source) {
                        const chunkArray = new Uint8Array(chunk.subarray())
                        const newData = new Uint8Array(responseData.length + chunkArray.length)
                        newData.set(responseData)
                        newData.set(chunkArray, responseData.length)
                        responseData = newData
                    }

                    if (responseData.length > 0) {
                        // Parse response
                        const responseText = new TextDecoder().decode(responseData)
                        const response = JSON.parse(responseText)

                        if (response.status === 'error') {
                            throw new Error(response.message)
                        }

                        console.log(`Successfully sent proposal to peer ${peer.id}`)
                        return response
                    } else {
                        throw new Error('No response data received')
                    }
                } catch (error) {
                    console.warn(`Failed to send proposal to peer ${peer.id}:`, error.message)
                    throw error
                }
            })
        )

        // Count successes and failures
        const successes = results.filter(r => r.status === 'fulfilled').length
        const failures = results.filter(r => r.status === 'rejected').length

        console.log(`Broadcast complete: ${successes} successful, ${failures} failed`)

        if (successes === 0) {
            throw new Error('Failed to send proposal to any peers')
        }

        return results
    }

    async createProposal(config) {
        const proposal = new TaskProposal({
            proposerId: this.node.peerId.toString(),
            ...config
        })

        this.proposals.set(proposal.id, proposal)

        try {
            await this.broadcastProposal(proposal)

            console.log(`Node ${this.node.config.port}: Created proposal ${proposal.id}`)

            this.emit('proposalCreated', {
                proposalId: proposal.id,
                timestamp: Date.now(),
                config: proposal
            })

            return proposal.id
        } catch (error) {
            console.error('Error creating proposal:', error)
            this.proposals.delete(proposal.id)
            throw error
        }
    }


    async acquireLock(proposalId) {
        const lockId = randomBytes(16).toString('hex')
        const requesterId = this.node.peerId.toString()

        try {
            const proposal = this.proposals.get(proposalId)
            if (!proposal) {
                throw new Error('Proposal not found')
            }

            // Convert string to proper PeerId
            let proposerPeerId;
            try {
                proposerPeerId = peerIdFromString(proposal.proposerId)
                console.log(`Node ${this.node.config.port}: Attempting to acquire lock for proposal ${proposalId}`)
            } catch (error) {
                console.error('Error creating PeerId:', error)
                return null
            }

            const message = {
                type: 'LOCK_REQUEST',
                payload: { proposalId, lockId, requesterId }
            }

            try {
                const stream = await this.node.node.dialProtocol(proposerPeerId, '/gppon/task/lock/1.0.0')

                await pipe(
                    [uint8arrays.fromString(JSON.stringify(message))],
                    stream.sink
                )

                let responseData = new Uint8Array()
                for await (const chunk of stream.source) {
                    const chunkArray = new Uint8Array(chunk.subarray())
                    const newData = new Uint8Array(responseData.length + chunkArray.length)
                    newData.set(responseData)
                    newData.set(chunkArray, responseData.length)
                    responseData = newData
                }

                const response = JSON.parse(new TextDecoder().decode(responseData))
                // console.log(`response: ${JSON.stringify(response, null, 2)}`);

                if (response.result.success) {
                    console.log(`Node ${this.node.config.port}: Successfully acquired lock for proposal ${proposalId}`)
                    return response.result.lockId
                } else {
                    console.log(`Node ${this.node.config.port}: Failed to acquire lock for proposal ${proposalId}: ${response.result.reason}`)
                    return null
                }

            } catch (error) {
                console.error(`Node ${this.node.config.port}: Error in lock request:`, error)
                return null
            }
        } catch (error) {
            console.error(`Node ${this.node.config.port}: Error acquiring lock:`, error)
            return null
        }
    }

    async releaseLock(proposalId, lockId) {
        try {
            const proposal = this.proposals.get(proposalId)
            if (!proposal) {
                throw new Error('Proposal not found')
            }

            // Convert string to proper PeerId
            let proposerPeerId;
            try {
                proposerPeerId = peerIdFromString(proposal.proposerId)
            } catch (error) {
                console.error('Error creating PeerId:', error)
                return
            }

            const message = {
                type: 'UNLOCK_REQUEST',
                payload: { proposalId, lockId }
            }

            const stream = await this.node.node.dialProtocol(proposerPeerId, '/gppon/task/unlock/1.0.0')
            await pipe(
                [uint8arrays.fromString(JSON.stringify(message))],
                stream.sink
            )

        } catch (error) {
            console.error('Error releasing lock:', error)
        }
    }
    async processAcceptance(message) { }

    async attemptAcceptProposal(proposalId) {
        const proposal = this.proposals.get(proposalId)

        if (!proposal || proposal.state !== TaskState.PROPOSED) {
            return false;
        }

        try {
            // Try to acquire lock first
            const lockId = await this.acquireLock(proposalId)
            if (lockId === null) {
                return false;
            }

            console.log(`Node ${this.node.config.port}: proceeding with acceptance`)
            let proposerPeerId;

            try {
                // Convert proposer ID to proper PeerId
                proposerPeerId = peerIdFromString(proposal.proposerId)
                console.log(`Node ${this.node.config.port}: Attempting to acquire acceptance for proposal ${proposalId}`)
                const message = {
                    type: 'TASK_ACCEPTANCE',
                    payload: {
                        proposalId,
                        acceptedBy: this.node.peerId.toString(),
                        timestamp: Date.now()
                    }
                }

                // Update state immediately
                proposal.state = TaskState.ACCEPTED
                proposal.acceptedBy = this.node.peerId.toString()

                // Notify proposer
                const stream = await this.node.node.dialProtocol(proposerPeerId, '/gppon/task/accept/1.0.0')
                await pipe(
                    [uint8arrays.fromString(JSON.stringify(message))],
                    stream.sink
                )
                let responseData = new Uint8Array()
                for await (const chunk of stream.source) {
                    const chunkArray = new Uint8Array(chunk.subarray())
                    const newData = new Uint8Array(responseData.length + chunkArray.length)
                    newData.set(responseData)
                    newData.set(chunkArray, responseData.length)
                    responseData = newData
                }

                const response = JSON.parse(new TextDecoder().decode(responseData))
                console.log(`response: ${JSON.stringify(response, null, 2)}`);

                if (response.status === 'ok') {
                    console.log(`Node ${this.node.config.port}: Successfully acquired acceptance for proposal ${proposalId}`)
                } else {
                    console.log(`Node ${this.node.config.port}: Failed to acquire acceptance for proposal ${proposalId}: ${response.reason}`)
                    return null
                }

                await this.startTask(proposal)
                return true;

            } catch (error) {
                console.error(`Node ${this.node.config.port}: Error in task acceptance:`, error)
                // Reset state on failure
                proposal.state = TaskState.PROPOSED
                proposal.acceptedBy = null
                await this.releaseLock(proposalId, lockId)
                return false;
            }

        } catch (error) {
            console.error(`Node ${this.node.config.port}: Error in attemptAcceptProposal:`, error)
            if (proposal) {
                proposal.state = TaskState.PROPOSED
                proposal.acceptedBy = null
            }
            return false;
        }
    }

    canHandleTask(proposal) {
        return (
            this.capabilities.cpu >= proposal.requirements.cpu &&
            this.capabilities.memory >= proposal.requirements.memory &&
            this.capabilities.bandwidth >= proposal.requirements.bandwidth &&
            this.capabilities.storage >= proposal.requirements.storage &&
            this.activeTasks.size < (this.maxConcurrentTasks || 5)
        )
    }


    async startTask(proposal) {
        let proposerPeerId
        try {
            // console.log(JSON.stringify(proposal, null, 2));
            proposerPeerId = peerIdFromString(proposal.proposerId)
            console.log(`Node ${this.node.config.port}: Attempting to start task for proposal ${proposal.id}`)
            const message = {
                type: 'TASK_STATUS_UPDATE',
                payload: {
                    taskId: proposal.id,
                    status: TaskState.RUNNING,
                    progress: 0,
                    timestamp: Date.now()
                }
            }

            // Update state immediately
            proposal.state = TaskState.RUNNING

            console.log(TASK_PROTOCOLS.STATUS);
            

            // Notify proposer
            const stream = await this.node.node.dialProtocol(proposerPeerId, TASK_PROTOCOLS.STATUS)
            await pipe(
                [uint8arrays.fromString(JSON.stringify(message))],
                stream.sink
            )
            console.log(`Node ${this.node.config.port}: Starting task execution for proposal ${proposal.id}`)

            // Simulate task execution with a delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            await runDocker(proposal);

            await this.completeTask(proposal.id, { success: true });
        } catch (error) {

        }
    }


    async completeTask(taskId, result) {
        const proposal = this.proposals.get(taskId)
        if (proposal) {
            proposal.state = TaskState.COMPLETED
            proposal.result = result

            console.log(`Node ${this.node.config.port}: Task ${taskId} completed with result: ${JSON.stringify(result)}`);
            

            const message = {
                type: 'TASK_RESULT',
                payload: {
                    proposalId: taskId,
                    result,
                    timestamp: Date.now()
                }
            }

            try {
                console.log('proposal.proposerId', proposal.proposerId);

                let proposerPeerId;
                try {
                    proposerPeerId = peerIdFromString(proposal.proposerId)
                    console.log(`Node ${this.node.config.port}: Attempting to send result for proposal ${proposal.id}`)
                } catch (error) {
                    console.error('Error creating PeerId:', error)
                    return null
                }
    
                const stream = await this.node.node.dialProtocol(proposerPeerId, TASK_PROTOCOLS.RESULT)
                await pipe(
                    [uint8arrays.fromString(JSON.stringify(message))],
                    stream.sink
                )

                this.activeTasks.delete(taskId)

                this.emit('taskCompleted', {
                    proposalId: taskId,
                    result,
                    timestamp: Date.now()
                })
            } catch (error) {
                console.error('Error sending task result:', error)
                throw error
            }
        }
    }

    // Utility methods
    getProposalsByState(state) {
        return TaskUtility.getProposalsByState(this.proposals, state)
    }
    
    getActiveTasks() {
        return TaskUtility.getActiveTasks(this.activeTasks)
    }
    
    updateCapabilities(capabilities) {
        this.capabilities = TaskUtility.updateCapabilities(this.capabilities, capabilities)
    }
    
    async cancelProposal(proposalId) {
        const proposal = this.proposals.get(proposalId)
        const cancelled = await TaskUtility.cancelProposal(proposal)
        if (cancelled) {
            this.emit('proposalCancelled', {
                proposalId,
                timestamp: Date.now()
            })
        }
        return cancelled
    }
    
    canHandleTask(proposal) {
        return TaskUtility.canHandleTask(
            this.capabilities, 
            proposal, 
            this.activeTasks, 
            this.maxConcurrentTasks
        )
    }
}

export default TaskManager