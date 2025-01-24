// taskProtocols.js

export const TASK_PROTOCOLS = {
    // Protocol versions
    PROPOSE: '/gppon/task/propose/1.0.0',
    ACCEPT: '/gppon/task/accept/1.0.0',
    STATUS: '/gppon/task/status/1.0.0',
    RESULT: '/gppon/task/result/1.0.0',
    CANCEL: '/gppon/task/cancel/1.0.0',
    FILE:'/gppon/task/file/1.0.0'
  }
  
  export const MessageTypes = {
    TASK_PROPOSAL: 'TASK_PROPOSAL',
    TASK_ACCEPTANCE: 'TASK_ACCEPTANCE',
    TASK_STATUS_UPDATE: 'TASK_STATUS_UPDATE',
    TASK_RESULT: 'TASK_RESULT',
    TASK_CANCELLATION: 'TASK_CANCELLATION'
  }
  
  // Message validators
  export const validateProposal = (proposal) => {
    const required = ['proposerId', 'image', 'command']
    const missing = required.filter(field => !proposal[field])
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`)
    }
    
    if (proposal.instances && (!Number.isInteger(proposal.instances) || proposal.instances < 1)) {
      throw new Error('Instances must be a positive integer')
    }
    
    return true
  }
  
  export const validateRequirements = (requirements) => {
    const fields = ['cpu', 'memory', 'bandwidth', 'storage']
    
    for (const field of fields) {
      if (requirements[field] && typeof requirements[field] !== 'number') {
        throw new Error(`${field} must be a number`)
      }
      if (requirements[field] && requirements[field] < 0) {
        throw new Error(`${field} must be positive`)
      }
    }
    
    return true
  }
  
  // Message creators
  export const createProposalMessage = (proposal) => ({
    type: MessageTypes.TASK_PROPOSAL,
    payload: proposal
  })
  
  export const createAcceptanceMessage = (proposalId, acceptorId) => ({
    type: MessageTypes.TASK_ACCEPTANCE,
    payload: {
      proposalId,
      acceptedBy: acceptorId,
      timestamp: Date.now()
    }
  })
  
  export const createStatusMessage = (taskId, status, progress = null) => ({
    type: MessageTypes.TASK_STATUS_UPDATE,
    payload: {
      taskId,
      status,
      progress,
      timestamp: Date.now()
    }
  })
  
  export const createResultMessage = (proposalId, result) => ({
    type: MessageTypes.TASK_RESULT,
    payload: {
      proposalId,
      result,
      timestamp: Date.now()
    }
  })
  
  export const createCancellationMessage = (proposalId, reason = null) => ({
    type: MessageTypes.TASK_CANCELLATION,
    payload: {
      proposalId,
      reason,
      timestamp: Date.now()
    }
  })