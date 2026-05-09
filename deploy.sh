#!/bin/bash
# Quick deployment script for Vercel

echo "🚀 OPTOSAFE-AN Deployment"
echo "=========================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "❌ Not a git repository"
    echo "Initialize with: git init && git add . && git commit -m 'Initial commit'"
    exit 1
fi

# Check if files are committed
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ All changes committed"
else
    echo "⚠️  Uncommitted changes detected"
    echo "Run: git add . && git commit -m 'Your message'"
    exit 1
fi

# Check if remote is set
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "❌ No GitHub remote configured"
    echo "Add with: git remote add origin <your-github-url>"
    exit 1
fi

echo "✅ Repository ready"
echo ""
echo "Next steps:"
echo "1. Push to GitHub: git push origin main"
echo "2. Go to: https://vercel.com"
echo "3. Click 'Add New' → 'Project'"
echo "4. Select this repository"
echo "5. Click 'Deploy'"
echo ""
echo "Your app will be live at: https://<project-name>.vercel.app"
