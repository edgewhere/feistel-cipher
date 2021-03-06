/*
MIT License

Copyright (c) 2021 Cyril Dever

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import { toBase256Readable } from '.'
import { Readable, readable2Buffer } from './utils/base256'
import { Engine, H, isAvailableEngine } from './utils/hash'
import { add, extract, split } from './utils/strings'
import { NEUTRAL_BYTE, xor } from './utils/xor'

/**
 * The FPECipher class is the latest entry point to the Feistel cipher lib providing full Format-Preserving Encryption.
 * It makes use of one of the four hash algorithm added to the library (Blake-2b, Keccak, SHA-256 and SHA-3) to hash
 * messages using the passed base key and at least 2 rounds.
 * For optimal security, use a 256-bits key. And 10 rounds is a good start.
 * Once instantiated, use the encrypt() or decrypt() methods on the FPECipher instance with the appropriate data.
 * 
 * @throws wrong arguments
 */
export class FPECipher {
  engine: Engine
  key: string
  rounds: number

  constructor(engine: Engine, key: string, rounds: number) {
    if (!isAvailableEngine(engine) || key === '' || rounds < 2) {
      throw new Error('wrong arguments')
    }
    this.engine = engine
    this.key = key
    this.rounds = rounds
  }

  /**
     * Obfuscate the passed data
     * 
     * @param {string} data - The data to obfuscate
     * @returns {Readable} The byte array of the obfuscated result.
     */
  encrypt(data: string): Readable {
    let parts = split(data)
    // Apply the FPE Feistel cipher
    for (let i = 0; i < this.rounds; ++i) { // eslint-disable-line no-loops/no-loops
      const left = parts[1]
      if (parts[1].length < parts[0].length) {
        parts[1] += NEUTRAL_BYTE
      }
      const rnd = this.round(parts[1], i)
      let tmp = parts[0]
      let crop = false
      if (tmp.length + 1 === rnd.length) {
        tmp += NEUTRAL_BYTE
        crop = true
      }
      let right = xor(tmp, rnd)
      if (crop) {
        right = right.substr(0, right.length - 1)
      }
      parts = [left, right]
    }
    return toBase256Readable(Buffer.from(parts.join('')))
  }

  /**
   * Deobfuscate the passed data
   * 
   * @param {Readable} obfuscated - The string to use
   * @returns {string} The deobfuscated string.
   */
  decrypt(obfuscated: Readable): string {
    if (obfuscated.length === 0) {
      return ''
    }
    // Apply the FPE Feistel cipher
    const parts = split(readable2Buffer(obfuscated).toString())
    let [left, right] = parts
    // Compensating the way Split() works by moving the first byte at right to the end of left if using an odd number of rounds
    if (this.rounds % 2 !== 0 && left.length !== right.length) {
      left += right.substr(0, 1)
      right = right.substr(1)
    }
    for (let i = 0; i < this.rounds; ++i) { // eslint-disable-line no-loops/no-loops
      let leftRound = left
      if (left.length < right.length) {
        leftRound += NEUTRAL_BYTE
      }
      const rnd = this.round(leftRound, this.rounds - i - 1)
      let rightRound = right
      let extended = false
      if (rightRound.length + 1 === rnd.length) {
        rightRound += left.substr(left.length - 1)
        extended = true
      }
      let tmp = xor(rightRound, rnd)
      right = left
      if (extended) {
        tmp = tmp.substr(0, tmp.length - 1)
      }
      left = tmp
    }
    return left + right
  }

  // Feistel implementation

  // Round is the function applied at each round of the obfuscation process to the right side of the Feistel cipher
  private round(item: string, index: number): string {
    const addition = add(item, extract(this.key, index, item.length))
    const hashed = H(Buffer.from(addition), this.engine).toString('hex')
    return extract(hashed, index, item.length)
  }
}