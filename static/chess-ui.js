/**
 * Minimal Chess UI
 * - Click-click and drag-drop move input
 * - Legal move highlighting
 * - Last move highlighting  
 * - Check/checkmate indicators
 * - Board flipping
 * - Lichess-style arrow/circle annotations
 */

class ChessUI {
    constructor() {
        // Game state
        this.game = new Chess();
        this.selectedSquare = null;
        this.legalMoves = [];
        this.lastMove = null;
        this.isFlipped = false;

        // Theme config
        this.pieceTheme = 'wikipedia';

        // Drag state (left-click piece movement)
        this.isDragging = false;
        this.dragPiece = null;
        this.dragStartSquare = null;
        this.ghostPiece = null;

        // Annotation state (right-click arrows/circles)
        this.annotations = { arrows: [], circles: [] };
        this.drawingState = {
            isDrawing: false,
            startSquare: null,
            currentSquare: null,
            modifiers: { shift: false, ctrl: false, alt: false }
        };
        this.annotationColors = {
            default: 'rgba(21, 120, 60, 0.8)',   // green
            shift: 'rgba(255, 170, 0, 0.8)',     // orange
            ctrl: 'rgba(200, 40, 50, 0.8)',      // red
            alt: 'rgba(50, 120, 200, 0.8)'       // blue
        };

        // DOM elements
        this.boardEl = document.getElementById('board');
        this.drawingLayer = document.getElementById('drawing-layer');
        this.statusEl = document.getElementById('status');
        this.flipBtn = document.getElementById('flip-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.stateJsonEl = document.getElementById('state-json');

        this.init();
    }

    async init() {
        this.createBoard();
        this.renderPosition();
        this.bindEvents();
        await this.syncWithServer();
    }

    createBoard() {
        this.boardEl.innerHTML = '';
        for (let rank = 7; rank >= 0; rank--) {
            for (let file = 0; file < 8; file++) {
                const square = document.createElement('div');
                const squareName = this.coordsToSquare(file, rank);
                const isLight = (file + rank) % 2 === 1;

                square.className = `square ${isLight ? 'light' : 'dark'}`;
                square.dataset.square = squareName;

                this.boardEl.appendChild(square);
            }
        }
        // Re-attach the drawing layer since innerHTML='' removed it
        if (!this.drawingLayer || !this.boardEl.contains(this.drawingLayer)) {
            console.warn('Drawing layer lost or not attached, recreating/re-attaching');
            // If it exists but was removed by innerHTML, re-create it.
            // If it was never created (e.g., initial load and element not found), create it.
            this.drawingLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.drawingLayer.id = 'drawing-layer';
            this.drawingLayer.setAttribute('class', 'drawing-layer');
        }
        this.boardEl.appendChild(this.drawingLayer);
    }

    renderPosition() {
        const squares = this.boardEl.querySelectorAll('.square');

        squares.forEach(square => {
            // Clear existing pieces
            const existingPiece = square.querySelector('.piece');
            if (existingPiece) existingPiece.remove();

            // Clear state classes
            square.classList.remove('selected', 'legal-move', 'legal-capture', 'last-move', 'in-check');

            // Add piece if present
            const squareName = square.dataset.square;
            const piece = this.game.get(squareName);

            if (piece) {
                const pieceEl = document.createElement('div');
                const pieceClass = piece.color === 'w' ? 'w' : 'b';
                pieceEl.className = `piece ${pieceClass}${piece.type.toUpperCase()}`;
                pieceEl.style.backgroundImage = `url('${this.getPieceUrl(piece)}')`;
                pieceEl.draggable = true;
                square.appendChild(pieceEl);
            }
        });

        // Apply visual indicators
        this.highlightLastMove();
        this.highlightCheck();
        this.updateStatus();
        this.updateStatePanel();
    }

    bindEvents() {
        // Square click events (left-click clears annotations)
        this.boardEl.addEventListener('click', (e) => {
            this.clearAnnotations();
            this.handleSquareClick(e);
        });

        // Left-click drag events for piece movement
        this.boardEl.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.handleDragStart(e);
        });
        document.addEventListener('mousemove', (e) => {
            this.handleDragMove(e);
            this.handleDrawingMove(e);
        });
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.handleDragEnd(e);
            if (e.button === 2) this.handleDrawingEnd(e);
        });

        // Right-click for annotations
        this.boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
        this.boardEl.addEventListener('mousedown', (e) => {
            if (e.button === 2) this.handleDrawingStart(e);
        });

        // Touch events for mobile
        this.boardEl.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        document.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Button events
        this.flipBtn.addEventListener('click', () => this.flipBoard());
        this.resetBtn.addEventListener('click', () => this.resetGame());

        // Copy JSON event
        const copyBtn = document.getElementById('copy-json-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (this.stateJsonEl) {
                    navigator.clipboard.writeText(this.stateJsonEl.textContent)
                        .then(() => {
                            const originalText = copyBtn.textContent;
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => copyBtn.textContent = originalText, 2000);
                        })
                        .catch(err => console.error('Failed to copy JSON: ', err));
                }
            });
        }
    }

    handleSquareClick(e) {
        if (this.isDragging) return;

        const square = e.target.closest('.square');
        if (!square) return;

        const squareName = square.dataset.square;
        const piece = this.game.get(squareName);

        // If we have a selected square, try to make a move
        if (this.selectedSquare) {
            const moveUci = this.selectedSquare + squareName;

            // Check if this is a legal move
            if (this.legalMoves.some(m => m.startsWith(moveUci))) {
                this.makeMove(moveUci);
            } else if (piece && piece.color === this.game.turn()) {
                // Clicked on another piece of same color - select it
                this.selectSquare(squareName);
            } else {
                // Deselect
                this.clearSelection();
            }
        } else if (piece && piece.color === this.game.turn()) {
            // Select piece
            this.selectSquare(squareName);
        }
    }

    handleDragStart(e) {
        const pieceEl = e.target.closest('.piece');
        if (!pieceEl) return;

        const square = pieceEl.closest('.square');
        const squareName = square.dataset.square;
        const piece = this.game.get(squareName);

        // Only allow dragging pieces of current turn
        if (!piece || piece.color !== this.game.turn()) return;

        e.preventDefault();

        this.isDragging = true;
        this.dragPiece = pieceEl;
        this.dragStartSquare = squareName;

        // Select the square and show legal moves
        this.selectSquare(squareName);

        // Add dragging class
        pieceEl.classList.add('dragging');

        // Create ghost piece
        this.createGhostPiece(e, piece);
    }

    handleDragMove(e) {
        if (!this.isDragging || !this.ghostPiece) return;

        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);

        this.ghostPiece.style.left = `${x - 35}px`;
        this.ghostPiece.style.top = `${y - 35}px`;
    }

    handleDragEnd(e) {
        if (!this.isDragging) return;

        const x = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        const y = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);

        // Find target square
        const targetSquare = this.getSquareAtPosition(x, y);

        if (targetSquare && this.dragStartSquare) {
            const moveUci = this.dragStartSquare + targetSquare;

            if (this.legalMoves.some(m => m.startsWith(moveUci))) {
                this.makeMove(moveUci);
            }
        }

        // Cleanup
        this.cleanupDrag();
    }

    handleTouchStart(e) {
        const touch = e.touches[0];
        const pieceEl = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.piece');

        if (pieceEl) {
            e.preventDefault();
            this.handleDragStart({
                target: pieceEl,
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => { }
            });
        }
    }

    handleTouchMove(e) {
        if (this.isDragging) {
            e.preventDefault();
            this.handleDragMove({
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            });
        }
    }

    handleTouchEnd(e) {
        this.handleDragEnd({
            changedTouches: e.changedTouches
        });
    }

    createGhostPiece(e, piece) {
        this.ghostPiece = document.createElement('div');
        const pieceClass = piece.color === 'w' ? 'w' : 'b';
        this.ghostPiece.className = `ghost-piece ${pieceClass}${piece.type.toUpperCase()}`;
        this.ghostPiece.style.backgroundImage = `url('${this.getPieceUrl(piece)}')`;

        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);

        this.ghostPiece.style.left = `${x - 35}px`;
        this.ghostPiece.style.top = `${y - 35}px`;

        document.body.appendChild(this.ghostPiece);
    }

    cleanupDrag() {
        if (this.dragPiece) {
            this.dragPiece.classList.remove('dragging');
        }

        if (this.ghostPiece) {
            this.ghostPiece.remove();
            this.ghostPiece = null;
        }

        this.isDragging = false;
        this.dragPiece = null;
        this.dragStartSquare = null;
        this.clearSelection();
    }

    getSquareAtPosition(x, y) {
        const elements = document.elementsFromPoint(x, y);
        const square = elements.find(el => el.classList.contains('square'));
        return square ? square.dataset.square : null;
    }

    selectSquare(squareName) {
        this.clearSelection();
        this.selectedSquare = squareName;

        // Highlight selected square
        const square = this.boardEl.querySelector(`[data-square="${squareName}"]`);
        if (square) square.classList.add('selected');

        // Show legal moves from this square
        this.showLegalMoves(squareName);
    }

    clearSelection() {
        this.selectedSquare = null;

        const squares = this.boardEl.querySelectorAll('.square');
        squares.forEach(sq => {
            sq.classList.remove('selected', 'legal-move', 'legal-capture');
        });
    }

    showLegalMoves(fromSquare) {
        const movesFromSquare = this.legalMoves.filter(m => m.startsWith(fromSquare));

        movesFromSquare.forEach(move => {
            const toSquare = move.substring(2, 4);
            const square = this.boardEl.querySelector(`[data-square="${toSquare}"]`);

            if (square) {
                const piece = this.game.get(toSquare);
                if (piece) {
                    square.classList.add('legal-capture');
                } else {
                    square.classList.add('legal-move');
                }
            }
        });
    }

    highlightLastMove() {
        if (!this.lastMove) return;

        const fromSquare = this.boardEl.querySelector(`[data-square="${this.lastMove.from}"]`);
        const toSquare = this.boardEl.querySelector(`[data-square="${this.lastMove.to}"]`);

        if (fromSquare) fromSquare.classList.add('last-move');
        if (toSquare) toSquare.classList.add('last-move');
    }

    highlightCheck() {
        if (!this.game.in_check()) return;

        // Find king of current turn
        const turn = this.game.turn();
        const squares = this.boardEl.querySelectorAll('.square');

        squares.forEach(square => {
            const squareName = square.dataset.square;
            const piece = this.game.get(squareName);

            if (piece && piece.type === 'k' && piece.color === turn) {
                square.classList.add('in-check');
            }
        });
    }

    updateStatus() {
        let status = '';
        let statusClass = '';

        const turn = this.game.turn() === 'w' ? 'White' : 'Black';

        if (this.game.in_checkmate()) {
            const winner = this.game.turn() === 'w' ? 'Black' : 'White';
            status = `Checkmate! ${winner} wins`;
            statusClass = 'checkmate';
        } else if (this.game.in_stalemate()) {
            status = 'Stalemate - Draw';
            statusClass = 'stalemate';
        } else if (this.game.in_draw()) {
            status = 'Draw';
            statusClass = 'draw';
        } else if (this.game.in_check()) {
            status = `${turn} is in check`;
            statusClass = 'check';
        } else {
            status = `${turn} to move`;
        }

        this.statusEl.textContent = status;
        this.statusEl.className = `status ${statusClass}`;
    }

    updateStatePanel() {
        if (!this.stateJsonEl) return;

        const state = {
            fen: this.game.fen(),
            lastMove: this.lastMove,
            annotations: this.annotations
        };

        this.stateJsonEl.textContent = JSON.stringify(state, null, 2);
    }

    async makeMove(moveUci) {
        // Handle promotion - default to queen
        let finalMove = moveUci;
        const from = moveUci.substring(0, 2);
        const to = moveUci.substring(2, 4);
        const piece = this.game.get(from);

        // Check if pawn promotion
        if (piece && piece.type === 'p') {
            const toRank = to[1];
            if ((piece.color === 'w' && toRank === '8') || (piece.color === 'b' && toRank === '1')) {
                finalMove = moveUci + 'q'; // Auto-promote to queen
            }
        }

        try {
            const response = await fetch('/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fen: this.game.fen(),
                    move: finalMove
                })
            });

            const data = await response.json();

            if (data.valid) {
                // Store last move
                this.lastMove = { from, to };

                // Update game state
                this.game.load(data.fen);
                this.legalMoves = data.legal_moves || [];

                // Re-render
                this.clearSelection();
                this.renderPosition();
            }
        } catch (error) {
            console.error('Move failed:', error);
        }
    }

    async syncWithServer() {
        try {
            const response = await fetch('/fen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen: this.game.fen() })
            });

            const data = await response.json();

            if (data.valid) {
                this.legalMoves = data.legal_moves || [];
            }
        } catch (error) {
            console.error('Sync failed:', error);
            // Fallback - use chess.js for legal moves
            this.legalMoves = this.game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
        }
    }

    flipBoard() {
        this.isFlipped = !this.isFlipped;
        this.boardEl.classList.toggle('flipped', this.isFlipped);
    }

    async resetGame() {
        try {
            const response = await fetch('/reset');
            const data = await response.json();

            this.game.load(data.fen);
            this.legalMoves = data.legal_moves || [];
            this.lastMove = null;
            this.selectedSquare = null;

            this.renderPosition();
        } catch (error) {
            console.error('Reset failed:', error);
            // Local fallback
            this.game.reset();
            this.legalMoves = this.game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
            this.lastMove = null;
            this.selectedSquare = null;
            this.renderPosition();
        }
    }

    coordsToSquare(file, rank) {
        return String.fromCharCode(97 + file) + (rank + 1);
    }

    getPieceUrl(piece) {
        const color = piece.color;
        const type = piece.type.toUpperCase();
        return `img/chesspieces/${this.pieceTheme}/${color}${type}.png`;
    }

    // ==================== ANNOTATION SYSTEM ====================

    handleDrawingStart(e) {
        e.preventDefault();
        const square = this.getSquareFromEvent(e);
        console.log('Drawing Start:', square, e.button);
        if (!square) return;

        this.drawingState = {
            isDrawing: true,
            startSquare: square,
            currentSquare: square,
            modifiers: {
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                alt: e.altKey
            }
        };
    }

    handleDrawingMove(e) {
        if (!this.drawingState.isDrawing) return;

        const square = this.getSquareFromEvent(e);
        if (square && square !== this.drawingState.currentSquare) {
            this.drawingState.currentSquare = square;
            this.renderAnnotations(); // Show preview
        }
    }

    handleDrawingEnd(e) {
        console.log('Drawing End:', this.drawingState, e.button);
        if (!this.drawingState.isDrawing) return;

        const endSquare = this.getSquareFromEvent(e) || this.drawingState.currentSquare;
        const startSquare = this.drawingState.startSquare;
        const color = this.getAnnotationColor(this.drawingState.modifiers);

        console.log('Finishing annotation:', { start: startSquare, end: endSquare, color });

        if (startSquare === endSquare) {
            // Circle
            this.toggleCircle(startSquare, color);
        } else {
            // Arrow
            this.toggleArrow(startSquare, endSquare, color);
        }

        this.drawingState.isDrawing = false;
        this.drawingState.startSquare = null;
        this.drawingState.currentSquare = null;

        try {
            this.renderAnnotations();
        } catch (err) {
            console.error('Error rendering annotations:', err);
        }
    }

    getSquareFromEvent(e) {
        const x = e.clientX;
        const y = e.clientY;
        const elements = document.elementsFromPoint(x, y);
        const squareEl = elements.find(el => el.classList.contains('square'));
        return squareEl ? squareEl.dataset.square : null;
    }

    getAnnotationColor(modifiers) {
        if (modifiers.ctrl) return this.annotationColors.ctrl;
        if (modifiers.shift) return this.annotationColors.shift;
        if (modifiers.alt) return this.annotationColors.alt;
        return this.annotationColors.default;
    }

    toggleArrow(from, to, color) {
        const idx = this.annotations.arrows.findIndex(
            a => a.from === from && a.to === to
        );
        if (idx !== -1) {
            // Same arrow exists - toggle off or change color
            if (this.annotations.arrows[idx].color === color) {
                this.annotations.arrows.splice(idx, 1);
            } else {
                this.annotations.arrows[idx].color = color;
            }
        } else {
            this.annotations.arrows.push({ from, to, color });
        }
    }

    toggleCircle(square, color) {
        const idx = this.annotations.circles.findIndex(c => c.square === square);
        if (idx !== -1) {
            if (this.annotations.circles[idx].color === color) {
                this.annotations.circles.splice(idx, 1);
            } else {
                this.annotations.circles[idx].color = color;
            }
        } else {
            this.annotations.circles.push({ square, color });
        }
    }

    clearAnnotations() {
        console.log('Clearing annotations');
        this.annotations = { arrows: [], circles: [] };
        this.renderAnnotations();
    }

    renderAnnotations() {
        this.updateStatePanel();

        // Clear SVG
        this.drawingLayer.innerHTML = '';

        const boardRect = this.boardEl.getBoundingClientRect();
        const squareSize = boardRect.width / 8;

        console.log('Rendering annotations', {
            width: boardRect.width,
            height: boardRect.height,
            squareSize,
            circles: this.annotations.circles.length,
            arrows: this.annotations.arrows.length
        });

        // Draw circles
        for (const circle of this.annotations.circles) {
            console.log('Drawing circle at', circle.square);
            this.drawCircle(circle.square, circle.color, squareSize);
        }

        // Draw arrows
        for (const arrow of this.annotations.arrows) {
            this.drawArrow(arrow.from, arrow.to, arrow.color, squareSize);
        }

        // Draw preview arrow if drawing
        if (this.drawingState.isDrawing &&
            this.drawingState.startSquare !== this.drawingState.currentSquare) {
            const color = this.getAnnotationColor(this.drawingState.modifiers);
            this.drawArrow(
                this.drawingState.startSquare,
                this.drawingState.currentSquare,
                color.replace('0.8', '0.5'), // More transparent for preview
                squareSize
            );
        }
    }

    getSquareCenter(square, squareSize) {
        const file = square.charCodeAt(0) - 97; // 0-7
        const rank = parseInt(square[1]) - 1;   // 0-7

        let x, y;
        if (this.isFlipped) {
            x = (7 - file + 0.5) * squareSize;
            y = (rank + 0.5) * squareSize;
        } else {
            x = (file + 0.5) * squareSize;
            y = (7 - rank + 0.5) * squareSize;
        }
        return { x, y };
    }

    drawCircle(square, color, squareSize) {
        const center = this.getSquareCenter(square, squareSize);
        const radius = squareSize * 0.4;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', center.x);
        circle.setAttribute('cy', center.y);
        circle.setAttribute('r', radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', squareSize * 0.08);

        this.drawingLayer.appendChild(circle);
    }

    drawArrow(from, to, color, squareSize) {
        const start = this.getSquareCenter(from, squareSize);
        const end = this.getSquareCenter(to, squareSize);

        // Calculate angle and shorten the line to make room for arrowhead
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const headLength = squareSize * 0.35;
        const headWidth = squareSize * 0.25;
        const strokeWidth = squareSize * 0.15;

        // Shorten line to make room for arrowhead
        const shortenBy = headLength * 0.7;
        const lineEndX = end.x - Math.cos(angle) * shortenBy;
        const lineEndY = end.y - Math.sin(angle) * shortenBy;

        // Create line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', start.x);
        line.setAttribute('y1', start.y);
        line.setAttribute('x2', lineEndX);
        line.setAttribute('y2', lineEndY);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', strokeWidth);
        line.setAttribute('stroke-linecap', 'round');

        // Create arrowhead
        const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        const tipX = end.x;
        const tipY = end.y;
        const baseX = end.x - Math.cos(angle) * headLength;
        const baseY = end.y - Math.sin(angle) * headLength;
        const leftX = baseX + Math.cos(angle - Math.PI / 2) * headWidth / 2;
        const leftY = baseY + Math.sin(angle - Math.PI / 2) * headWidth / 2;
        const rightX = baseX + Math.cos(angle + Math.PI / 2) * headWidth / 2;
        const rightY = baseY + Math.sin(angle + Math.PI / 2) * headWidth / 2;

        arrowhead.setAttribute('points', `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`);
        arrowhead.setAttribute('fill', color);

        this.drawingLayer.appendChild(line);
        this.drawingLayer.appendChild(arrowhead);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.chessUI = new ChessUI();
});
