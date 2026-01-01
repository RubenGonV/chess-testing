from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import chess

app = FastAPI()

# Add CORS middleware to allow external apps to connect
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MoveRequest(BaseModel):
    fen: str
    move: str  # UCI format, e.g., "e2e4"


class FenRequest(BaseModel):
    fen: str


@app.post("/move")
def make_move(req: MoveRequest):
    """Validate and execute a move. Returns new FEN, validity, legal moves, and game state."""
    board = chess.Board(req.fen)
    try:
        move = chess.Move.from_uci(req.move)
        if move in board.legal_moves:
            board.push(move)
            return {
                "fen": board.fen(),
                "valid": True,
                "legal_moves": [m.uci() for m in board.legal_moves],
                "is_check": board.is_check(),
                "is_checkmate": board.is_checkmate(),
                "is_stalemate": board.is_stalemate(),
                "is_game_over": board.is_game_over(),
            }
    except Exception:
        pass
    return {
        "fen": req.fen,
        "valid": False,
        "legal_moves": [m.uci() for m in board.legal_moves],
        "is_check": board.is_check(),
        "is_checkmate": board.is_checkmate(),
        "is_stalemate": board.is_stalemate(),
        "is_game_over": board.is_game_over(),
    }


@app.post("/fen")
def get_fen_info(req: FenRequest):
    """Get legal moves and game state for a given FEN position."""
    try:
        board = chess.Board(req.fen)
        return {
            "valid": True,
            "legal_moves": [m.uci() for m in board.legal_moves],
            "is_check": board.is_check(),
            "is_checkmate": board.is_checkmate(),
            "is_stalemate": board.is_stalemate(),
            "is_game_over": board.is_game_over(),
        }
    except Exception:
        return {"valid": False, "error": "Invalid FEN"}


@app.get("/reset")
def reset_game():
    """Return the starting position FEN and initial game state."""
    board = chess.Board()
    return {
        "fen": board.fen(),
        "legal_moves": [m.uci() for m in board.legal_moves],
        "is_check": False,
        "is_checkmate": False,
        "is_stalemate": False,
        "is_game_over": False,
    }


# Serve the frontend
app.mount("/", StaticFiles(directory="static", html=True), name="static")
