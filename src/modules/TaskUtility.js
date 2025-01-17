import { TaskState } from './states/taskState.js'

export class TaskUtility {
    static getProposalsByState(proposals, state) {
        return Array.from(proposals.values())
            .filter(proposal => proposal.state === state)
    }

    static getActiveTasks(activeTasks) {
        return Array.from(activeTasks.values())
    }

    static updateCapabilities(currentCapabilities, newCapabilities) {
        return {
            ...currentCapabilities,
            ...newCapabilities
        }
    }

    static async cancelProposal(proposal) {
        if (proposal && proposal.state !== TaskState.COMPLETED) {
            proposal.state = TaskState.CANCELLED
            return true
        }
        return false
    }

    static canHandleTask(capabilities, proposal, activeTasks, maxConcurrentTasks = 5) {
        return (
            capabilities.cpu >= proposal.requirements.cpu &&
            capabilities.memory >= proposal.requirements.memory &&
            capabilities.bandwidth >= proposal.requirements.bandwidth &&
            capabilities.storage >= proposal.requirements.storage &&
            activeTasks.size < maxConcurrentTasks
        )
    }
}