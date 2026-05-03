#!/bin/bash

echo "🔍 Running pre-deployment checks..."

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found! Create it from .env.example"
    exit 1
fi

# Check for required env vars
required_vars=("GROQ_API_KEY" "GOOGLE_AI_KEY" "FIREBASE_PROJECT_ID")
for var in "${required_vars[@]}"; do
    if ! grep -q "^$var=" .env.local; then
        echo "❌ Missing required env var: $var"
        exit 1
    fi
done

echo "✅ Environment variables OK"

# Type check
echo "🔍 Running type check..."
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ Type check failed"
    exit 1
fi
echo "✅ Type check passed"

# Lint
echo "🔍 Running linter..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ Lint failed"
    exit 1
fi
echo "✅ Lint passed"

# Tests
echo "🔍 Running test..."
npm run test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed"
    exit 1
fi
echo "✅ Tests passed"

# Build
echo "🔍 Building for production..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"

echo ""
echo "✅ All pre-deployment checks passed!"
echo "🚀 Ready to deploy to Vercel"
