# Integration Guide

This guide explains how to integrate the Chess App with your own application. You can integrate via the REST API for logic or by embedding the UI.

## Integration Methods

### 1. REST API Integration
The app provides a REST API at `http://localhost:8000`. You can use this to validate moves or maintain game state in your own backend.

**Base URL**: `http://localhost:8000`

#### Endpoints

- **`POST /move`**
  - **Description**: Validates and executes a move on a given board state.
  - **Body**:
    ```json
    {
      "fen": "start_fen_string",
      "move": "e2e4" // UCI format
    }
    ```
  - **Response**:
    ```json
    {
      "fen": "new_fen_string",
      "valid": true,
      "legal_moves": ["e7e5", "c7c5", ...],
      "is_check": false,
      "is_checkmate": false
    }
    ```

- **`POST /fen`**
  - **Description**: Get legal moves and status for a position.
  - **Body**: `{"fen": "fen_string"}`

- **`GET /reset`**
  - **Description**: Get the starting position.

#### Python Example

```python
import requests

BASE_URL = "http://localhost:8000"

# 1. Start a game
start_state = requests.get(f"{BASE_URL}/reset").json()
current_fen = start_state['fen']
print(f"Game started: {current_fen}")

# 2. Make a move (e.g., e2 to e4)
payload = {
    "fen": current_fen,
    "move": "e2e4"
}
response = requests.post(f"{BASE_URL}/move", json=payload).json()

if response['valid']:
    print(f"Move successful! New FEN: {response['fen']}")
else:
    print("Invalid move.")
```

### 2. UI Embedding (IFrame)
To show the chess board in your web app, you can embed it using an IFrame.

```html
<iframe 
    src="http://localhost:8000" 
    width="600" 
    height="600" 
    style="border:none;">
</iframe>
```

## CORS Support
The backend is configured to allow Cross-Origin Resource Sharing (CORS) from any origin (`*`). This means your frontend application (e.g., running on port 3000) can directly call the API.
