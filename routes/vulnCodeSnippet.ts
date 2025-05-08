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
import { execSync } from 'child_process'; // Import for OS Command Injection

const challengeUtils = require('../lib/challengeUtils')

interface SnippetRequestBody {
  challenge: string
}

interface VerdictRequestBody {
  selectedLines: number[]
  key: string
}

// Interface for the new RCE vulnerable function
interface DebugCommandBody {
  command: string
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
  // Define the base directory for codefixes to prevent escape
  const baseDir = path.resolve('./data/static/codefixes/')
  // Sanitize the key: remove any non-alphanumeric characters (except hyphen and underscore for typical keys)
  // This is a basic sanitization. A stricter allow-list for 'key' characters is even better.
  const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, '')
  const filePath = path.resolve(baseDir, sanitizedKey + '.info.yml')

  // Check if the resolved path is still within the base directory
  if (filePath.startsWith(baseDir + path.sep)) {
    if (fs.existsSync(filePath)) {
      try {
        const codingChallengeInfos = yaml.load(fs.readFileSync(filePath, 'utf8')) as any // Type assertion for safety
        if (codingChallengeInfos?.hints) {
          if (accuracy.getFindItAttempts(key) > codingChallengeInfos.hints.length) {
            if (vulnLines.length === 1) {
              hint = res.__('Line {{vulnLine}} is responsible for this vulnerability or security flaw. Select it and submit to proceed.', { vulnLine: vulnLines[0].toString() })
            } else {
              hint = res.__('Lines {{vulnLines}} are responsible for this vulnerability or security flaw. Select them and submit to proceed.', { vulnLines: vulnLines.toString() })
            }
          } else {
            const nextHint = codingChallengeInfos.hints[accuracy.getFindItAttempts(key) - 1] // -1 prevents after first attempt
            if (nextHint) hint = res.__(nextHint)
          }
        }
      } catch (fileReadError) {
        console.error("Error reading or parsing YAML file:", fileReadError);
        // Decide how to handle this error, e.g., log it, set a default hint, or return an error response
      }
    }
  } else {
    // Log potential path traversal attempt or handle as an error
    console.warn(`Potential directory traversal attempt with key: ${key}, resolved to: ${filePath}`)
    // Optionally, you could set a generic hint or error here
  }
  // --- End of Directory Traversal Fix ---

  if (verdict) {
    await challengeUtils.solveFindIt(key) // Assuming key is safe here due to earlier sanitization for file path
    res.status(200).json({
      verdict: true
    })
  } else {
    accuracy.storeFindItVerdict(key, false) // Assuming key is safe here
    res.status(200).json({
      verdict: false,
      hint
    })
  }
}

// --- CRITICAL VULNERABILITY (OS COMMAND INJECTION) ADDED FOR TESTING PURPOSES ---
// This function contains an OS Command Injection vulnerability.
// DO NOT USE THIS IN PRODUCTION. It is for SAST tool testing only.
exports.executeDebugCommand = () => async (req: Request<Record<string, unknown>, Record<string, unknown>, DebugCommandBody>, res: Response, next: NextFunction) => {
  const userInput = req.body.command; // User input from the request body

  if (!userInput || typeof userInput !== 'string') {
    return res.status(400).json({ status: 'error', error: 'Invalid command input.' });
  }

  try {
    // CRITICAL: Directly using unsanitized user input in execSync leads to OS Command Injection.
    // An attacker can provide OS commands that will be executed on the server.
    // For example, sending {"command": "ls -la /"} or {"command": "touch /tmp/pwned_by_os_command"}
    // could list files or create a file on the server.
    // On Windows, a command like "dir" or "echo pwned > C:\\pwned.txt" would work.
    const result = execSync(userInput, { encoding: 'utf8' }); // Execute the command
    res.status(200).json({ status: 'success', result: String(result) });
  } catch (error: any) {
    console.error(`Error during command execution: ${utils.getErrorMessage(error)}`);
    // Send back stderr or a generic error message
    const errorMessage = error.stderr ? error.stderr.toString() : utils.getErrorMessage(error);
    res.status(500).json({ status: 'error', error: `Execution failed: ${errorMessage}` });
  }
}
// --- END OF CRITICAL VULNERABILITY SECTION ---
