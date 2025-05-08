/*
 * Copyright (c) 2014-2024 Bjoern Kimminich & the OWASP Juice Shop contributors.
 * SPDX-License-Identifier: MIT
 */

import { type NextFunction, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path' // Added for path manipulation
import yaml from 'js-yaml'
import { getCodeChallenges } from '../lib/codingChallenges'
import * as accuracy from '../lib/accuracy'
import * as utils from '../lib/utils'
import { execFileSync } from 'child_process'; // Changed from execSync to execFileSync for safer execution of specific commands

const challengeUtils = require('../lib/challengeUtils')

interface SnippetRequestBody {
  challenge: string
}

interface VerdictRequestBody {
  selectedLines: number[]
  key: string
}

interface DebugCommandBody {
  command: string
  // Potentially add args if your commands need them, and handle them safely
  // args?: string[]
}

const setStatusCode = (error: any) => {
  switch (error.name) {
    case 'BrokenBoundary':
      return 422
    default:
      return 200
  }
}

export const retrieveCodeSnippet = async (challengeKey: string) => {
  const codeChallenges = await getCodeChallenges()
  if (codeChallenges.has(challengeKey)) {
    return codeChallenges.get(challengeKey) ?? null
  }
  return null
}

exports.serveCodeSnippet = () => async (req: Request<SnippetRequestBody, Record<string, unknown>, Record<string, unknown>>, res: Response, next: NextFunction) => {
  try {
    const snippetData = await retrieveCodeSnippet(req.params.challenge)
    if (snippetData == null) {
      res.status(404).json({ status: 'error', error: `No code challenge for challenge key: ${req.params.challenge}` })
      return
    }
    res.status(200).json({ snippet: snippetData.snippet })
  } catch (error) {
    const statusCode = setStatusCode(error)
    res.status(statusCode).json({ status: 'error', error: utils.getErrorMessage(error) })
  }
}

export const retrieveChallengesWithCodeSnippet = async () => {
  const codeChallenges = await getCodeChallenges()
  return [...codeChallenges.keys()]
}

exports.serveChallengesWithCodeSnippet = () => async (req: Request, res: Response, next: NextFunction) => {
  const codingChallenges = await retrieveChallengesWithCodeSnippet()
  res.json({ challenges: codingChallenges })
}

export const getVerdict = (vulnLines: number[], neutralLines: number[], selectedLines: number[]) => {
  if (selectedLines === undefined) return false
  if (vulnLines.length > selectedLines.length) return false
  if (!vulnLines.every(e => selectedLines.includes(e))) return false
  const okLines = [...vulnLines, ...neutralLines]
  const notOkLines = selectedLines.filter(x => !okLines.includes(x))
  return notOkLines.length === 0
}

exports.checkVulnLines = () => async (req: Request<Record<string, unknown>, Record<string, unknown>, VerdictRequestBody>, res: Response, next: NextFunction) => {
  const key = req.body.key
  let snippetData
  try {
    snippetData = await retrieveCodeSnippet(key)
    if (snippetData == null) {
      res.status(404).json({ status: 'error', error: `No code challenge for challenge key: ${key}` })
      return
    }
  } catch (error) {
    const statusCode = setStatusCode(error)
    res.status(statusCode).json({ status: 'error', error: utils.getErrorMessage(error) })
    return
  }
  const vulnLines: number[] = snippetData.vulnLines
  const neutralLines: number[] = snippetData.neutralLines
  const selectedLines: number[] = req.body.selectedLines
  const verdict = getVerdict(vulnLines, neutralLines, selectedLines)
  let hint

  // --- Fix for Directory Traversal ---
  const baseDir = path.resolve('./data/static/codefixes/')
  const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '')
  const filePath = path.resolve(baseDir, sanitizedKey + '.info.yml')

  if (filePath.startsWith(baseDir + path.sep)) {
    if (fs.existsSync(filePath)) {
      try {
        const codingChallengeInfos = yaml.load(fs.readFileSync(filePath, 'utf8')) as any
        if (codingChallengeInfos?.hints) {
          if (accuracy.getFindItAttempts(key) > codingChallengeInfos.hints.length) {
            if (vulnLines.length === 1) {
              hint = res.__('Line {{vulnLine}} is responsible for this vulnerability or security flaw. Select it and submit to proceed.', { vulnLine: vulnLines[0].toString() })
            } else {
              hint = res.__('Lines {{vulnLines}} are responsible for this vulnerability or security flaw. Select them and submit to proceed.', { vulnLines: vulnLines.toString() })
            }
          } else {
            const nextHint = codingChallengeInfos.hints[accuracy.getFindItAttempts(key) - 1]
            if (nextHint) hint = res.__(nextHint)
          }
        }
      } catch (fileReadError) {
        console.error("Error reading or parsing YAML file:", fileReadError);
      }
    }
  } else {
    console.warn(`Potential directory traversal attempt with key: ${key}, resolved to: ${filePath}`)
  }
  // --- End of Directory Traversal Fix ---

  if (verdict) {
    await challengeUtils.solveFindIt(key)
    res.status(200).json({
      verdict: true
    })
  } else {
    accuracy.storeFindItVerdict(key, false)
    res.status(200).json({
      verdict: false,
      hint
    })
  }
}

// --- OS COMMAND INJECTION VULNERABILITY FIXED ---
// The function now only allows a predefined set of safe commands.
exports.executeDebugCommand = () => async (req: Request<Record<string, unknown>, Record<string, unknown>, DebugCommandBody>, res: Response, next: NextFunction) => {
  const userInput = req.body.command;

  if (!userInput || typeof userInput !== 'string') {
    return res.status(400).json({ status: 'error', error: 'Invalid command input.' });
  }

  // Define an allow-list of safe commands and their actual executable paths/arguments
  // This is crucial for security. Only whitelisted commands are permitted.
  const allowedCommands: { [key: string]: { command: string, args: string[] } } = {
    'list-files-current-dir': { command: 'ls', args: ['-la'] }, // Example for Linux/macOS
    'show-date': { command: 'date', args: [] },
    // Add more safe, predefined commands here.
    // For Windows, you might have:
    // 'list-files-current-dir-win': { command: 'cmd', args: ['/c', 'dir'] },
    // 'show-date-win': { command: 'cmd', args: ['/c', 'date', '/T'] }
  };

  if (allowedCommands.hasOwnProperty(userInput)) {
    const cmdDetails = allowedCommands[userInput];
    try {
      // Use execFileSync for synchronous execution without shell interpolation.
      // The command and arguments are passed separately.
      const result = execFileSync(cmdDetails.command, cmdDetails.args, { encoding: 'utf8', timeout: 5000 }); // Added timeout
      res.status(200).json({ status: 'success', result: String(result).trim() });
    } catch (error: any) {
      console.error(`Error during command execution: ${utils.getErrorMessage(error)}`);
      const errorMessage = error.stderr ? error.stderr.toString() : (error.stdout ? error.stdout.toString() : utils.getErrorMessage(error));
      res.status(500).json({ status: 'error', error: `Execution failed: ${errorMessage.trim()}` });
    }
  } else {
    // If the command is not in the allow-list, reject it.
    res.status(403).json({ status: 'error', error: 'Command not allowed.' });
  }
}
// --- END OF FIXED SECTION ---
