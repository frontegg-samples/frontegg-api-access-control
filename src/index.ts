import express, { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';
import jwt from 'jsonwebtoken';
import { EntitlementsClientFactory, RequestContextType, SubjectContext } from '@frontegg/e10s-client';

config();  // Load environment variables from .env

// Load the public key (replace with the actual path to your public key)

// Initialize the Entitlements client
const e10sClient = EntitlementsClientFactory.create({
  pdpHost: process.env.PDP_HOST || 'localhost:8181',
});

// Middleware to extract and decode JWT and create SubjectContext
function extractSubjectContext(req: Request): SubjectContext | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null; // No Authorization header found
  }

  const token = authHeader.split(' ')[1]; // Assuming the format is "Bearer <token>"
  if (!token) {
    return null; // Token not found
  }

  try {
    // Verify and decode the JWT using the RS256 algorithm with the public key
    const decodedToken: any = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', { algorithms: ['RS256'] });

    // Map decoded token claims to the SubjectContext
    const subjectContext: SubjectContext = {
      tenantId: decodedToken.tenantId,  // Ensure tenantId is included in the token claims
      userId: decodedToken.sub,         // Assuming the 'sub' claim represents the user ID
      permissions: decodedToken.permissions || [],  // Assuming permissions are provided in the token
      attributes: decodedToken.attributes || {} // Custom attributes if present
    };

    return subjectContext;
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null; // Invalid token
  }
}

// Middleware to validate entitlement for any route and method
async function validateEntitlement(req: Request, res: Response, next: NextFunction) {
  // Validate token and extract SubjectContext
  const subjectContext = extractSubjectContext(req);

  if (!subjectContext) {
    return res.status(401).json({ message: 'Unauthorized - Invalid or missing token' });
  }

  try {
    const method = req.method;  // Extract the HTTP method (GET, POST, etc.)
    const path = req.path;      // Extract the path from req
    console.log(`Validating entitlement for ${method} ${path} for tenant ${subjectContext.tenantId}`);

    const e10sResult = await e10sClient.isEntitledTo(subjectContext, {
      type: RequestContextType.Route,
      method,
      path,
    });

    if (e10sResult.result) {
      next(); // If entitlement validation passes, proceed to the next middleware or route handler
    } else {
      return res.status(403).json({
        message: `Access denied for ${method} ${path}`,
        reason: e10sResult.justification || 'No justification provided',
      });
    }
  } catch (error) {
    console.error('Error during entitlement check:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// Express app setup
const app = express();

// Use entitlement validation middleware for all routes
app.use(validateEntitlement);

// Define some example routes
/* app.get('/healthcheck', (req: Request, res: Response) => {
  res.status(200).json({ message: 'GET /healthcheck successful' });
}); */

app.get('/data', (req: Request, res: Response) => {
  res.status(200).json({ message: 'POST /data successful' });
});

// Start the Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
