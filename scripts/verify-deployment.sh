#!/bin/bash

DEPLOYMENT_URL="https://votedebate-ai.vercel.app" # Change to your URL

echo "🔍 Verifying deployment at $DEPLOYMENT_URL"

# Check homepage
echo "Checking homepage..."
status=$(curl -s -o /dev/null -w "%{http_code}" $DEPLOYMENT_URL)
if [ $status -eq 200 ]; then
    echo "✅ Homepage OK"
else
    echo "❌ Homepage returned $status"
fi

# Check health endpoint
echo "Checking /api/health..."
health=$(curl -s "$DEPLOYMENT_URL/api/health")
echo "$health" | grep -q "groq"
if [ $? -eq 0 ]; then
    echo "✅ Health API OK"
else
    echo "❌ Health API failed"
fi

# Check debate endpoint
echo "Checking /api/agents/debate..."
debate=$(curl -s -X POST "$DEPLOYMENT_URL/api/agents/debate" \
    -H "Content-Type: application/json" \
    -d '{"topic":"What is NOTA?"}')
    
echo "$debate" | grep -q "responses"
if [ $? -eq 0 ]; then
    echo "✅ Debate API OK"
else
    echo "❌ Debate API failed"
fi

echo ""
echo "✅ Deployment verification complete!"
