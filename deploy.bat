@echo off
REM Quick deployment script for Vercel (Windows)

echo.
echo 🚀 OPTOSAFE-AN Deployment
echo ==========================
echo.

REM Check if git is initialized
if not exist .git (
    echo ❌ Not a git repository
    echo Initialize with: git init ^&^& git add . ^&^& git commit -m "Initial commit"
    exit /b 1
)

echo ✅ Git repository found
echo.

REM Check git status
git status --porcelain >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git is not working properly
    exit /b 1
)

echo ✅ All systems ready for deployment
echo.
echo Next steps:
echo 1. Push code: git push origin main
echo 2. Visit: https://vercel.com
echo 3. Click "Add New" > "Project"
echo 4. Select your GitHub repository
echo 5. Click "Deploy"
echo.
echo Your app will be live at: https://your-project-name.vercel.app
echo.
pause
