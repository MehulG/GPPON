import { pipe } from 'it-pipe'
import { TaskState } from './states/taskState.js'
import fs from 'fs';
import { peerIdFromString } from '@libp2p/peer-id';

export async function handleProtocol(handler, { connection, stream }) {
    try {
        // Collect chunks from the stream
        let data = new Uint8Array();
        for await (const chunk of stream.source) {
            // Convert Uint8ArrayList to Uint8Array
            const chunkArray = new Uint8Array(chunk.subarray());
            // Combine with existing data
            const newData = new Uint8Array(data.length + chunkArray.length);
            newData.set(data);
            newData.set(chunkArray, data.length);
            data = newData;
        }

        // Only process if we have data
        if (data.length > 0) {
            // Check if the data is JSON or binary
            const isJson = data[0] === 123; // 123 is the ASCII code for '{'
            if (isJson) {
                // Convert to string and parse
                const messageStr = new TextDecoder().decode(data);
                const message = JSON.parse(messageStr);

                // Handle the message
                const result = await handler(message);

                // Send response
                const response = {
                    status: 'ok',
                    result,
                    timestamp: Date.now()
                };

                const responseData = new TextEncoder().encode(JSON.stringify(response));
                await pipe([responseData], stream.sink);
            } else {
                // Handle binary data (e.g., file data)
                await handler({ stream });
            }
        } else {
            // Handle empty stream case
            const errorResponse = {
                status: 'error',
                message: 'No data received',
                timestamp: Date.now()
            };
            const responseData = new TextEncoder().encode(JSON.stringify(errorResponse));
            await pipe([responseData], stream.sink);
        }
    } catch (error) {
        console.error('Error in protocol handler:', error);
        try {
            const errorResponse = {
                status: 'error',
                message: error.message,
                timestamp: Date.now()
            };
            const responseData = new TextEncoder().encode(JSON.stringify(errorResponse));
            await pipe([responseData], stream.sink);
        } catch (e) {
            console.error('Error sending error response:', e);
        }
    }
}

export async function handleLockRequest(message) {
    const { proposalId, lockId, requesterId } = message.payload
    const proposal = this.proposals.get(proposalId)

    try {
        if (!proposal) {
            console.log(`Node ${this.node.config.port}: Lock request denied - proposal ${proposalId} not found`)
            return { success: false, reason: 'Proposal not found', lockId: null }
        }

        // Prevent proposer from locking their own proposal
        if (requesterId === proposal.proposerId) {
            console.log(`Node ${this.node.config.port}: Lock denied - proposer cannot lock their own task`)
            return { success: false, reason: 'Proposer cannot lock their own task', lockId: null }
        }

        // Check if task is already locked
        if (proposal.state === TaskState.LOCKED) {
            // Check if lock has expired
            if (Date.now() - proposal.lockTimestamp > this.lockTimeout) {
                // Lock has expired, allow new lock
                proposal.lockId = lockId
                proposal.lockTimestamp = Date.now()
                proposal.state = TaskState.LOCKED
                proposal.lockedBy = requesterId
                console.log(`Node ${this.node.config.port}: Lock expired for proposal ${proposalId}. New lock acquired by ${proposal.lockedBy}`)
                return { success: true, reason: 'Lock acquired', lockId }
            }
            console.log(`Node ${this.node.config.port}: Lock request denied - proposal ${proposalId} is locked by ${proposal.lockedBy}`)
            return { success: false, reason: 'Task is locked', lockId: null }
        }

        // Check if task is available
        if (proposal.state !== TaskState.PROPOSED) {
            console.log(`Node ${this.node.config.port}: Lock request denied - proposal ${proposalId} is in ${proposal.state} state`)
            return { success: false, reason: 'Task is not available', lockId: null }
        }

        // Lock the task
        proposal.lockId = lockId
        proposal.lockTimestamp = Date.now()
        proposal.state = TaskState.LOCKED
        proposal.lockedBy = requesterId

        console.log(`Node ${this.node.config.port}: Lock acquired for proposal ${proposalId} by ${proposal.lockedBy}`)
        return { success: true, reason: 'Lock acquired', lockId }
    } catch (error) {
        console.error(`Node ${this.node.config.port}: Error in handleLockRequest:`, error)
        return { success: false, reason: error.message, lockId: null }
    }
}

export async function handleUnlockRequest(message) {
    const { proposalId, lockId } = message.payload
    const proposal = this.proposals.get(proposalId)

    if (!proposal) {
        throw new Error('Proposal not found')
    }

    if (proposal.lockId !== lockId) {
        console.log(`Node ${this.node.config.port}: Invalid unlock attempt for proposal ${proposalId} by ${this.node.peerId.toString()}`)
        return { success: false, reason: 'Invalid lock ID' }
    }

    // Reset lock
    const previousLocker = proposal.lockedBy
    proposal.lockId = null
    proposal.lockTimestamp = null
    proposal.state = TaskState.PROPOSED
    proposal.lockedBy = null

    console.log(`Node ${this.node.config.port}: Lock released for proposal ${proposalId} (was locked by ${previousLocker})`)
    return { success: true }
}

export async function handleProposal(message) {
    try {
        if (!message || !message.payload) {
            throw new Error('Invalid proposal message')
        }

        const proposal = message.payload

        // Validate the proposal format
        if (!proposal.id || !proposal.proposerId || !proposal.containerConfig) {
            throw new Error('Invalid proposal format')
        }

        // Ensure we're not trying to handle our own proposal
        if (proposal.proposerId === this.node.peerId.toString()) {
            console.log(`Node ${this.node.config.port}: Ignoring own proposal ${proposal.id}`)
            return {
                proposalId: proposal.id,
                received: true,
                timestamp: Date.now()
            }
        }

        // Store the proposal
        this.proposals.set(proposal.id, proposal)

        // Emit event for proposal received
        this.emit('proposalReceived', proposal)

        // Only attempt to accept if we meet requirements
        if (this.canHandleTask(proposal)) {
            setTimeout(async () => {
                try {
                    // Add a small random delay to help prevent race conditions
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
                    await this.attemptAcceptProposal(proposal.id);
                } catch (error) {
                    console.log(`Failed to accept proposal ${proposal.id}: ${error.message}`);
                }
            }, 0);
        }

        return {
            proposalId: proposal.id,
            received: true,
            timestamp: Date.now()
        }
    } catch (error) {
        console.error('Error handling proposal:', error)
        throw error
    }
}

export async function handleAcceptance(message) {
    try {
        const { proposalId, acceptedBy } = message.payload;

        const proposal = this.proposals.get(proposalId);
        if (proposal && proposal.state === TaskState.LOCKED) {
            proposal.state = TaskState.ACCEPTED;
            proposal.acceptedBy = acceptedBy;

            let filePaths = proposal.containerConfig.env.INPUT_FILE;
            console.log(`filePaths: ${filePaths}`);
            
            for (let filePath of filePaths) {
                await streamFile.call(this, filePath, acceptedBy);
            }
        }
    } catch (error) {
        console.error('Error handling acceptance:', error);
        throw error;
    }
}

async function streamFile(filePath, acceptedBy) {
    try {
        const fileName = filePath.split('/').pop();
        const fileData = await fs.promises.readFile(filePath);
        const nameBuffer = Buffer.from(`${fileName}\0`);
        
        const peerStream = await this.node.node.dialProtocol(
            peerIdFromString(acceptedBy), 
            '/gppon/task/file/1.0.0'
        );
        
        await pipe(
            [Buffer.concat([nameBuffer, fileData])],
            peerStream.sink
        );
        
        console.log(`File ${fileName} streamed successfully to ${acceptedBy}`);
    } catch (error) {
        console.error('Error streaming file:', error);
        throw error;
    }
}

export async function handleFileReception({ stream }) {
    try {
        console.log('handleFileReception');
        console.log('stream:', JSON.stringify(stream, null, 2));
        
        let data = Buffer.alloc(0);
        
        for await (const chunk of stream.source) {
            const buffer = Buffer.from(chunk.subarray());
            data = Buffer.concat([data, buffer]);
        }
        
        const nullIndex = data.indexOf(0);
        if (nullIndex === -1) throw new Error('Invalid file format');
        
        const fileName = data.slice(0, nullIndex).toString();
        const fileContent = data.slice(nullIndex + 1);
        
        await fs.promises.writeFile(`./video-gen/${fileName}`, fileContent);
        console.log(`File ${fileName} received and saved`);
        
        return { success: true, fileName };
    } catch (error) {
        console.error('Error receiving file:', error);
        throw error;
    }
}

export async function handleOutputReception({stream}) {
    try {
        let data = Buffer.alloc(0);
        
        for await (const chunk of stream.source) {
            const buffer = Buffer.from(chunk.subarray());
            data = Buffer.concat([data, buffer]);
        }
        
        const nullIndex = data.indexOf(0);
        if (nullIndex === -1) throw new Error('Invalid file format');
        
        const fileName = data.slice(0, nullIndex).toString();
        const fileContent = data.slice(nullIndex + 1);
        
        await fs.promises.writeFile(`./out/${fileName}`, fileContent);
        console.log(`File ${fileName} received and saved`);
        
        return { success: true, fileName };        

    } catch (error) {
        console.error('Error receiving file:', error);
        throw error;
    }
}

export async function handleStatusUpdate(message) {
    console.log('handleStatusUpdate');

    try {
        const { taskId, status, progress } = message.payload
        const task = this.proposals.get(taskId);
        console.log(`task: ${JSON.stringify(task, null, 2)}`);

        if (task) {
            task.state = status
            task.progress = progress

            this.emit('taskStatusUpdated', {
                taskId,
                status,
                progress,
                timestamp: Date.now()
            })
        }
    } catch (error) {
        console.error('Error handling status update:', error)
        throw error
    }
}

export async function handleResult(message) {
    try {
        const { proposalId, result } = message.payload

        const proposal = this.proposals.get(proposalId)
        if (proposal) {
            proposal.state = TaskState.COMPLETED
            proposal.result = result

            this.emit('taskCompleted', {
                proposalId,
                result,
                timestamp: Date.now()
            })
        }
    } catch (error) {
        console.error('Error handling result:', error)
        throw error
    }
}