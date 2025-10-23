/**
 * Represents the main program interface that can be exported and used by other libraries.
 *
 * This class is intended to provide reusable functionality and act as a shared program module.
 *
 * @exports Program
 */

class Program {
}

/**
 * A frozen singleton instance of the `Program` class to ensure only one instance exists.
 * @type {Readonly<Program>}
 */
const PublicProgramModule: Readonly<Program> = Object.freeze(new Program())
export default PublicProgramModule
