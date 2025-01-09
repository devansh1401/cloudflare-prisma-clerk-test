import { Clerk as ClerkNode } from "@clerk/backend"
import type { ExecutionContext } from "@cloudflare/workers-types"
import { Pool } from "@neondatabase/serverless"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"

// Define the environment variables our Worker needs
export interface Env {
  DATABASE_URL: string
  DIRECT_URL: string
  CLERK_SECRET_KEY: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      // Initialize Clerk with the secret key from environment
      const clerk = new ClerkNode({ secretKey: env.CLERK_SECRET_KEY })

      // Check for authorization header
      const authHeader = request.headers.get("Authorization")
      if (!authHeader) {
        return new Response("Unauthorized - No auth header provided", {
          status: 401
        })
      }

      // Extract and verify the Clerk session token
      const token = authHeader.replace("Bearer ", "")
      const session = await clerk.sessions.verifySession(token)

      // Create a connection pool to Neon database
      const pool = new Pool({ connectionString: env.DIRECT_URL })

      // Set up Prisma with the Neon adapter
      const adapter = new PrismaNeon(pool)
      const prisma = new PrismaClient({
        adapter,
        datasources: {
          db: {
            url: env.DATABASE_URL
          }
        }
      })

      // Add a test user to verify our database connection
      const user = await prisma.user.create({
        data: {
          email: session.userId,
          name: "Test User"
        }
      })

      // Clean up the connection
      await pool.end()

      return new Response(
        JSON.stringify({
          success: true,
          message: "Connection test successful",
          user
        }),
        {
          headers: { "Content-Type": "application/json" }
        }
      )
    } catch (error) {
      console.error("Error:", error)
      return new Response(
        JSON.stringify({
          error: error.message,
          details: "An error occurred while processing your request"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    }
  }
}
