# PlaywrightMCP Test Automation Framework

## 🚀 Overview
Modern Python-based test automation framework combining Playwright MCP server with intelligent test planning capabilities.

## 🔧 Core Components

### **Playwright MCP Server**
• HTTP-based Model Context Protocol server for browser automation
• Runs on `127.0.0.1:8765` with headed browser support
• Provides REST API endpoints for Playwright actions

### **Python Test Framework** 
• `pytest` integration with professional HTML reporting
• `requests` library for API testing (restful-booker demo)
• `pandas` + `tabulate` for data analysis and tabular reports
• Comprehensive logging and CSV export capabilities

### **Intelligent Test Planning**
• `playwright-test-planner-python.agent.md` - AI agent for test case generation
• Automated test strategy development
• Context-aware test scenario creation

## 📁 Key Files
• `tests/test_api_final.py` - Complete API test suite
• `Automation_Framework/mcp_server/playwright_server.py` - MCP server
• `final_test_report.html` - pytest HTML reports
• `booking_analysis_*.csv` - exported test data

## 🎯 Features
• Multi-endpoint API testing
• Professional tabular reporting
• Real-time performance metrics
• SSL/TLS handling
• Background process management

## 🛠️ Framework Automation Steps

### **1. Environment Setup**
```bash
# Configure Python environment
source .venv/bin/activate
pip install pytest requests pandas tabulate pytest-html aiohttp
```

### **2. MCP Server Initialization**
```bash
# Start Playwright MCP Server in background
cd Automation_Framework/mcp_server
nohup python playwright_server.py > server.log 2>&1 &

# Verify server is running
curl -X POST http://127.0.0.1:8765/call -H "Content-Type: application/json" -d '{"tool": "screenshot"}'
```

### **3. Test Execution Process**
```bash
# Direct Python execution
python tests/test_api_final.py

# Pytest framework with HTML reports
pytest tests/test_api_final.py -v -s --html=final_test_report.html
```

### **4. Automated Test Flow**
• **Step 1:** Fetch all booking IDs from restful-booker API (2,266+ IDs retrieved)
• **Step 2:** Analyze individual booking details with filtering criteria
• **Step 3:** Generate professional tabular reports (Basic Info, Dates, Complete Details)
• **Step 4:** Perform API health validation and schema checks
• **Step 5:** Export data to CSV and generate execution summary

### **5. Results Generated**
• HTML test reports with execution metrics
• CSV exports for data analysis (`booking_analysis_*.csv`)
• Detailed logs (`api_test_execution.log`)
• Performance metrics (5.1 bookings/second processing rate)
