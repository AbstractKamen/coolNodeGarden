// ########################################################################
// ##############################CONFIGURATION#############################
// ########################################################################
const FRAMES = 60;
const WIDTH = 600;
const HEIGHT = 600;

const INITIAL_NUMBER_OF_NODES = 50;
const MAX_NUMBER_OF_NODES = 500;
// When mouse is pressed
const MAX_SPAWN_NODES = 150;
const MIN_SPAWN_NODES = 15;

const MAX_LINE_NODES = 150;
// The max distance between nodes where a line could be drawn.
// Also determines the `NODE_GARDEN_LINE_GRID` cell size.
const MAX_NODE_LINE_DISTANCE = 55;
const MIN_NODE_LINE_DISTANCE = 15;
// Draws only the closest # lines
const DRAW_CLOSEST_LINE_LIMIT = 7;
const MIN_NODE_DIAMETER = 2;
const MAX_NODE_DIAMETER = 5;

const MOUSE_MAX_NODE_LINE_DISTANCE = 65;
// 0 endless, 1 bounce
const CHOSEN_NODE_COORD_UPDATE_FUNCTION = 1;
/* Adjusts the final grid cell size. The larder the grid cell the higher
 * probability of nodes being needlessly iterated. A lower value means
 * less consistent distance mechanics for a small performance gain.
 */
const GRID_FACTOR = 0.85;

// Draws a 3x3 grid around a group node based on `NODE_GARDEN_GROUP_GRID`
var DEBUG_GROUP = false;
var groupRepr;
// Draws a 3x3 grid around a line node based on `NODE_GARDEN_LINE_GRID`
var DEBUG_LINE = false;
var lineRepr;
// Note only one grid can be debugged at a time

/* When greater than 0 some nodes are marked and given a random colour.
 * These group nodes can then extend their colour to other nodes.
 * The range of this can be a random value between
 * `MIN_NODE_GROUP_PAINT_DISTANCE` and `MIN_NODE_GROUP_PAINT_DISTANCE`
 */
const MAX_GROUP_NODES = 17;
// The maximum range a group node can extend its colour.
// Also determines the `NODE_GARDEN_GROUP_GRID` cell size.
const MAX_NODE_GROUP_PAINT_DISTANCE = 125;
// The minimum range a group node can extend its colour.
const MIN_NODE_GROUP_PAINT_DISTANCE = 25;
// If true all nodes are respawn when mouse is pressed
const REVIVE_ALL = true;
// If true dead nodes just stop else they drift off the canvas
const DEAD_NODES_STOP = false;
const MAX_REVIVED_NODES = 100;
const MAX_VELOCITY = 0.2;
const MIN_VELOCITY = 0.01;
// When it reaches 0 the node will stop moving
const MAX_LIFE_SPAN = 1000;
// The speed of node aging
const AGE_FACTOR = 0.03;

const BACKGROUND_COLOUR = "#153827";
const HEALTHY_NODE_COLOUR = "#417494";
const DEAD_NODE_COLOUR = "#1E1CCAF7";
const LINE_COLOUR = "#7097A8";

const WIDTH_OFFSET = 0;
const HEIGHT_OFFSET = 35;
const TEXT_COLOUR = "#296664";
const TEXT_BACKGROUND_COLOUR = "#0F0F1DF7";
// ########################################################################
// ############################END CONFIGURATION###########################
// ########################################################################

// data structure to reduce garbage collection
class ObjectPool {
  constructor(
    capacity,
    objectFactory = () => {
      return {};
    }
  ) {
    this.capacity = capacity;
    this.items = new Array(length);
    this.index = 0;
    for (let i = 0; i < capacity; ++i) {
      this.items[i] = objectFactory();
    }
  }

  getObject() {
    const v = this.items[this.index++];
    if (this.index > this.capacity) throw Error("OutOfMemory!");
    return v;
  }

  resetIndex() {
    this.index = 0;
  }
}

// data structure which can hold n closest node distances
class BinaryHeap {
  constructor() {
    this.items = [];
    this.size = 0;
  }

  isEmpty() {
    return this.size == 0;
  }

  push(item) {
    this.items[this.size] = item;
    this.heapifyUp(this.size);
    ++this.size;
  }

  pop() {
    if (this.isEmpty()) return null;
    let result = this.items[0];
    --this.size;
    if (this.size > 0) {
      this.items[0] = this.items[this.size];
      this.heapifyDown(0);
    }
    return result;
  }

  heapifyUp(i) {
    while (i > 0) {
      let parent = (i - 1) >>> 1;
      if (this.items[i].distance >= this.items[parent].distance) {
        this.swap(i, parent);
        i = parent;
      } else {
        return;
      }
    }
  }

  heapifyDown(i) {
    let half = this.size >>> 1;
    while (i < half) {
      let largest = this.largestChild(i);
      if (largest == i) {
        return;
      }
      this.swap(i, largest);
      i = largest;
    }
  }

  largestChild(i) {
    let left = (i << 1) + 1;
    let right = left + 1;
    let largest = i;
    if (
      left < this.size &&
      this.items[largest].distance < this.items[left].distance
    ) {
      largest = left;
    }
    if (
      right < this.size &&
      this.items[largest].distance < this.items[right].distance
    ) {
      largest = right;
    }
    return largest;
  }

  swap(a, b) {
    let tempA = this.items[a];
    this.items[a] = this.items[b];
    this.items[b] = tempA;
  }

  clear() {
    this.items.length = 0;
    this.size = 0;
  }
}

const EMPTY_CELL = [];
// efficient data structure to avoid square algorithm when checking distances
class NodeGardenGrid {
  constructor(gridHeight, gridWidth, cellSize) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;
    this.cellSize = cellSize;

    this.grid = new Array(gridHeight);
    for (let i = 0; i < gridHeight; ++i) {
      this.grid[i] = new Array(gridWidth);
      for (let j = 0; j < gridWidth; ++j) {
        this.grid[i][j] = [];
      }
    }
  }

  addNode(node) {
    let i = Math.floor(node.y / this.cellSize);
    let j = Math.floor(node.x / this.cellSize);
    let index = binarySearch(this.grid[i][j], node);

    if (index < 0) {
      this.grid[i][j].splice(-index - 1, 0, node);
    } else {
      this.grid[i][j].splice(index, 0, node);
    }
  }

  updateNode(node, newY, newX) {
    let i1 = Math.floor(node.y / this.cellSize);
    if (i1 < 0 || i1 >= this.gridHeight) return;
    let j1 = Math.floor(node.x / this.cellSize);
    if (j1 < 0 || j1 >= this.gridWidth) return;

    let i2 = Math.floor(newY / this.cellSize);
    if (i2 < 0 || i2 >= this.gridHeight) return;
    let j2 = Math.floor(newX / this.cellSize);
    if (j2 < 0 || j2 >= this.gridWidth) return;

    if (i1 == i2 && j1 == j2) return;

    {
      // remove node from old cell
      let index = binarySearch(this.grid[i1][j1], node);
      if (index < 0 || index >= this.grid[i1][j1].length) {
        console.error(node, this.cellSize, i1, j1, this.grid);
        throw new Error("Node to update doesn't exist at index: " + index);
      }
      this.grid[i1][j1].splice(index, 1);
    }

    // add node to new cell
    let index = binarySearch(this.grid[i2][j2], node);
    if (index < 0) {
      this.grid[i2][j2].splice(-index - 1, 0, node);
    } else {
      this.grid[i2][j2].splice(index, 0, node);
    }
  }

  removeNode(node) {
    let i = Math.floor(node.y / this.cellSize);
    let j = Math.floor(node.x / this.cellSize);
    let index = binarySearch(this.grid[i][j], node);
    if (index < 0 || index >= this.grid[i][j].length) {
      console.error(node, i, j, this.grid);
      throw new Error("Node to remove doesn't exist at index: " + index);
    }
    this.grid[i][j].splice(index, 1);
  }

  getCell(y, x, yDir, xDir) {
    let i = Math.floor(y / this.cellSize) + yDir;
    if (i < 0 || i >= this.gridHeight) return EMPTY_CELL;
    let j = Math.floor(x / this.cellSize) + xDir;
    if (j < 0 || j >= this.gridWidth) return EMPTY_CELL;
    return this.grid[i][j];
  }
}

function binarySearch(arr, node) {
  let low = 0;
  let high = arr.length - 1;

  while (low <= high) {
    let mid = (low + high) >>> 1;
    const cur = arr[mid];

    let compareToRes = nodesCompare(cur, node);
    if (compareToRes < 0) {
      low = mid + 1;
    } else if (compareToRes > 0) {
      high = mid - 1;
    } else {
      return mid;
    }
  }

  return -(low + 1);
}

function nodesCompare(cur, node) {
  if (cur === undefined) {
    return 1;
  }

  if (cur.id < node.id) {
    return 1;
  } else if (cur.id > node.id) {
    return -1;
  } else {
    return 0;
  }
}

const NODE_GARDEN_LINE_GRID = new NodeGardenGrid(
  Math.ceil((HEIGHT - HEIGHT_OFFSET) / MAX_NODE_LINE_DISTANCE / GRID_FACTOR),
  Math.ceil((WIDTH - WIDTH_OFFSET) / MAX_NODE_LINE_DISTANCE / GRID_FACTOR),
  Math.ceil(MAX_NODE_LINE_DISTANCE * GRID_FACTOR)
);
const NODE_GARDEN_GROUP_GRID = new NodeGardenGrid(
  Math.ceil(
    (HEIGHT - HEIGHT_OFFSET) / MAX_NODE_GROUP_PAINT_DISTANCE / GRID_FACTOR
  ),
  Math.ceil(
    (WIDTH - WIDTH_OFFSET) / MAX_NODE_GROUP_PAINT_DISTANCE / GRID_FACTOR
  ),
  Math.ceil(MAX_NODE_GROUP_PAINT_DISTANCE * GRID_FACTOR)
);
const nodeGroupColours = [];
const nodeGroupLineColours = [];
const distancesHeap = new BinaryHeap();

const NODES = new Array(INITIAL_NUMBER_OF_NODES);
const GROUP_NODES = [];
const LINE_NODES = new Array(MAX_LINE_NODES);
const drawnLines = new Set();
const DEAD_NODES = [];
const DISTANCE_LINES_POOL = new ObjectPool(MAX_NUMBER_OF_NODES);
const UPDATE_NODE_COORD_FUNCTIONS_ARRAY = [
  nodesPassThroughToOppositeSide,
  nodesCollideWithSides,
];
const HEX_ALPHA = "0123456789abcdef";
const strBuff = new Array(7);
var backgroundColour;
var lineColour;
var nodeColour;
var textBackgroundColour;
var textColour;
var updateNodeCoord;
var debugColour;

function setup() {
  groupRepr = GROUP_NODES[0];
  lineRepr = LINE_NODES[0];
  getGenerateRandomColours();
  updateNodeCoord =
    UPDATE_NODE_COORD_FUNCTIONS_ARRAY[CHOSEN_NODE_COORD_UPDATE_FUNCTION];
  frameRate(FRAMES);
  debugColour = debugColour = color("red");
  lineColour = color(LINE_COLOUR);
  dyingNodeColour = color(DEAD_NODE_COLOUR);
  nodeColour = color(HEALTHY_NODE_COLOUR);
  backgroundColour = color(BACKGROUND_COLOUR);
  textColour = color(TEXT_COLOUR);
  textBackgroundColour = color(TEXT_BACKGROUND_COLOUR);
  for (let i = 0; i < NODES.length; ++i) {
    let node = makeNode(
      Math.floor(Math.random() * WIDTH),
      Math.floor(Math.random() * HEIGHT)
    );
    NODES[i] = node;
    NODE_GARDEN_LINE_GRID.addNode(node);
    NODE_GARDEN_GROUP_GRID.addNode(node);
  }
  createCanvas(WIDTH, HEIGHT);
}

function draw() {
  drawnLines.clear();
  markNodesInGroupRange();
  closestIndex = 0;
  background(backgroundColour);
  drawNodeGardenHeader();
  applyMatrix(1, 0, 0, 1, WIDTH_OFFSET, HEIGHT_OFFSET);
  if (DEBUG_LINE) debugGrid(NODE_GARDEN_LINE_GRID);
  if (DEBUG_GROUP) debugGrid(NODE_GARDEN_GROUP_GRID);
  for (let i = 0; i < NODES.length; ++i) {
    distancesHeap.clear();
    DISTANCE_LINES_POOL.resetIndex();
    drawCurrentNode(NODES[i]);
  }
  if (DEBUG_LINE) debugNodes(NODE_GARDEN_LINE_GRID, lineRepr);
  if (DEBUG_GROUP) debugNodes(NODE_GARDEN_GROUP_GRID, groupRepr);
  for (let i = 0; i < NODES.length; ++i) {
    updateNode(NODES[i]);
  }
}

function drawCurrentNode(currentNode) {
  if (currentNode.isDead && !DEAD_NODES_STOP) return;
  stroke(currentNode.colour);
  strokeWeight(currentNode.diameter);
  point(currentNode.x, currentNode.y);
  if (!currentNode.isLineNode) return;
  drawMouseLine(currentNode);
  for (let dy = -1; dy <= 1; ++dy) {
    for (let dx = -1; dx <= 1; ++dx) {
      for (let adjacentNode of NODE_GARDEN_LINE_GRID.getCell(
          currentNode.y,
          currentNode.x,
          dy,
          dx
        )) {
        if (adjacentNode.x != currentNode) {
          let dx = adjacentNode.x - currentNode.x;
          let dy = adjacentNode.y - currentNode.y;
          let distance = Math.max(0, Math.sqrt(dx * dx + dy * dy));
          if (MIN_NODE_LINE_DISTANCE <= distance && distance < MAX_NODE_LINE_DISTANCE) {
            let drawnLine = hashLine(
              adjacentNode.x,
              adjacentNode.y,
              currentNode.x,
              currentNode.y
            );
            if (!drawnLines.has(drawnLine)) {
              drawnLines.add(drawnLine);
              let newLine = DISTANCE_LINES_POOL.getObject();
              newLine.distance = distance;
              newLine.x1 = currentNode.x;
              newLine.y1 = currentNode.y;
              newLine.x2 = adjacentNode.x;
              newLine.y2 = adjacentNode.y;
              distancesHeap.push(newLine);
            }
          }
        }
      }
    }
  }
  for (
    let j = 0; !distancesHeap.isEmpty() && j < DRAW_CLOSEST_LINE_LIMIT;
    ++j
  ) {
    let nodeLine = distancesHeap.pop();
    let diff = nodeLine.distance / MAX_NODE_LINE_DISTANCE;
    strokeWeight(1 - diff);
    stroke(currentNode.lineColour);
    line(nodeLine.x1, nodeLine.y1, nodeLine.x2, nodeLine.y2);
  }
}

function hashLine(x1, y1, x2, y2) {
  return (
    (x1 + 10000) * 1e2 +
    (y1 + 10000) * 1e4 +
    (x2 + 10000) * 1e2 +
    (y2 + 10000) * 1e4
  );
}

function mousePressed() {
  if (isDebugLineClick(mouseX, mouseY)) {
    if (!DEBUG_LINE) {
      if (lineRepr && !lineRepr.isDead) {
        lineRepr.lifespan = 1000;
        lineRepr.vx = Math.sign(lineRepr.vx) * MAX_VELOCITY;
        lineRepr.vy = Math.sign(lineRepr.vy) * MAX_VELOCITY;
      } else {
        for (lineNode of LINE_NODES) {
          if (!lineNode.isDead) {
            lineRepr = lineNode;
            lineRepr.lifespan = 1000;
            lineRepr.vx = Math.sign(lineRepr.vx) * MAX_VELOCITY;
            lineRepr.vy = Math.sign(lineRepr.vy) * MAX_VELOCITY;
            break;
          }
        }
      }
    }
    DEBUG_LINE = !DEBUG_LINE;
    return false;
  } else if (isDebugGroupClick(mouseX, mouseY)) {
    if (!DEBUG_GROUP) {
      if (groupRepr && !groupRepr.isDead) {
        groupRepr.lifespan = 1000;
        groupRepr.vx = Math.sign(groupRepr.vx) * MAX_VELOCITY;
        groupRepr.vy = Math.sign(groupRepr.vy) * MAX_VELOCITY;
      } else {
        for (groupNode of GROUP_NODES) {
          if (!groupNode.isDead) {
            groupRepr = groupNode;
            groupRepr.lifespan = 1000;
            groupRepr.vx = Math.sign(groupRepr.vx) * MAX_VELOCITY;
            groupRepr.vy = Math.sign(groupRepr.vy) * MAX_VELOCITY;
            break;
          }
        }
      }
    }
    DEBUG_GROUP = !DEBUG_GROUP;
    return false;
  }
  if (mouseY < HEIGHT_OFFSET || mouseX < WIDTH_OFFSET) return false;
  let nodeLimit = Math.min(
    MAX_NUMBER_OF_NODES,
    MIN_SPAWN_NODES +
    NODES.length +
    Math.floor(Math.random() * (MAX_SPAWN_NODES - MIN_SPAWN_NODES))
  );
  let mx = Math.min(WIDTH - WIDTH_OFFSET, Math.max(0, mouseX - WIDTH_OFFSET));
  let my = Math.min(
    HEIGHT - HEIGHT_OFFSET,
    Math.max(0, mouseY - HEIGHT_OFFSET)
  );
  if (NODES.length < MAX_NUMBER_OF_NODES) {
    for (let i = NODES.length; i < nodeLimit; ++i) {
      let x = mx + Math.random();
      let y = my + Math.random();
      let node = makeNode(x, y);
      NODES[i] = node;
      NODE_GARDEN_LINE_GRID.addNode(node);
      NODE_GARDEN_GROUP_GRID.addNode(node);
    }
  } else {
    if (REVIVE_ALL) {
      nodeLimit = Math.min(DEAD_NODES.length, MAX_REVIVED_NODES);
    } else {
      nodeLimit = Math.min(nodeLimit, DEAD_NODES.length);
    }

    while (nodeLimit-- > 0) {
      let x = mx + Math.random();
      let y = my + Math.random();
      let deadNode = DEAD_NODES.pop();
      let node = makeNode(x, y, deadNode);
      NODE_GARDEN_LINE_GRID.addNode(node);
      NODE_GARDEN_GROUP_GRID.addNode(node);
      node.isDead = false;
    }
  }
  return false;
}

function drawMouseLine(currentNode) {
  push();
  let mx = mouseX - WIDTH_OFFSET;
  let my = mouseY - HEIGHT_OFFSET;
  let dMx = currentNode.x - mx;
  let dMy = currentNode.y - my;
  let distFactor = currentNode.isGroupNode ? 2 : 1;

  let mouseDistance = Math.sqrt(dMx * dMx + dMy * dMy) - currentNode.diameter;
  if (mouseDistance < MOUSE_MAX_NODE_LINE_DISTANCE * distFactor) {
    let mouseDiff = mouseDistance / (MOUSE_MAX_NODE_LINE_DISTANCE * distFactor);
    if (currentNode.isGroupNode) {
      strokeWeight(5 - 5 * mouseDiff);
    } else {
      strokeWeight(1 - mouseDiff);
    }
    stroke(currentNode.lineColour);
    line(mx, my, currentNode.x, currentNode.y);
  }
  pop();
}

var nodeIdIndex = 0;

function makeNode(
  x = Math.random() * (WIDTH - WIDTH_OFFSET),
  y = Math.random() * (HEIGHT - HEIGHT_OFFSET),
  node = {
    id: nodeIdIndex++,
    x: x,
    y: y,
  }
) {
  node.x = Math.min(x, WIDTH - WIDTH_OFFSET);
  node.y = Math.min(y, HEIGHT - HEIGHT_OFFSET);
  node.vx = MIN_VELOCITY + Math.random() * (MAX_VELOCITY - MIN_VELOCITY);
  if (Math.random() - 0.5 < 0) node.vx *= -1;
  node.vy = MIN_VELOCITY + Math.random() * (MAX_VELOCITY - MIN_VELOCITY);
  if (Math.random() - 0.5 < 0) node.vy *= -1;
  if (node.isGroupNode) {
    node.diameter = MAX_NODE_DIAMETER * 2;
    node.lifespan = MAX_LIFE_SPAN;
  } else {
    node.lifespan = Math.floor(Math.random() * MAX_LIFE_SPAN);
    node.diameter =
      MIN_NODE_DIAMETER +
      Math.random() * (MAX_NODE_DIAMETER - MIN_NODE_DIAMETER);
  }

  if (GROUP_NODES.length < MAX_GROUP_NODES) {
    node.isLineNode = true;
    node.colour = nodeGroupColours[GROUP_NODES.length];
    node.diameter = MAX_NODE_DIAMETER * 2;
    node.lifespan = MAX_LIFE_SPAN;
    node.lineColour = nodeGroupLineColours[GROUP_NODES.length];
    node.isGroupNode = true;
    node.groupDistance =
      MIN_NODE_GROUP_PAINT_DISTANCE +
      Math.random() *
      (MAX_NODE_GROUP_PAINT_DISTANCE - MIN_NODE_GROUP_PAINT_DISTANCE);
    GROUP_NODES.push(node);
  } else if (!node.isLineNode && linePtr < MAX_LINE_NODES) {
    node.lineColour = lineColour;
    node.isLineNode = true;
    LINE_NODES[linePtr++] = node;
    node.colour = nodeColour;
  } else if (!node.colour) {
    node.colour = nodeColour;
  }
  return node;
}

var linePtr = 0;

function markNodesInGroupRange() {
  for (let i = 0; i < NODES.length; ++i) {
    let currentNode = NODES[i];
    if (!currentNode.isGroupNode) {
      currentNode.colour = nodeColour;
      currentNode.lineColour = lineColour;
      currentNode.distanceFromGroupNode = undefined;
    }
  }
  for (let i = 0; i < NODES.length; ++i) {
    let currentNode = NODES[i];
    if ((DEAD_NODES_STOP || !currentNode.isDead) && currentNode.isGroupNode) {
      for (let dy = -1; dy <= 1; ++dy) {
        for (let dx = -1; dx <= 1; ++dx) {
          for (let adjacentNode of NODE_GARDEN_GROUP_GRID.getCell(
              currentNode.y,
              currentNode.x,
              dy,
              dx
            )) {
            if (!adjacentNode.isGroupNode) {
              let dNx = adjacentNode.x - currentNode.x;
              let dNy = adjacentNode.y - currentNode.y;
              let distance = Math.max(0, Math.sqrt(dNx * dNx + dNy * dNy));
              if (
                distance < currentNode.groupDistance &&
                (!adjacentNode.distanceFromGroupNode ||
                  adjacentNode.distanceFromGroupNode > distance)
              ) {
                adjacentNode.colour = currentNode.colour;
                adjacentNode.lineColour = currentNode.colour;
                adjacentNode.distanceFromGroupNode = distance;
              }
            }
          }
        }
      }
    }
  }
}

function updateNode(node) {
  if (!node.isDead) {
    node.lifespan = Math.max(0, node.lifespan - AGE_FACTOR * deltaTime);
    // nodes go slower as they age
    let agingFactor = (1 - node.lifespan / MAX_LIFE_SPAN) / 100;
    node.vx =
      Math.sign(node.vx) *
      Math.max(MIN_VELOCITY, Math.abs(node.vx - node.vx * agingFactor));
    node.vy =
      Math.sign(node.vy) *
      Math.max(MIN_VELOCITY, Math.abs(node.vy - node.vy * agingFactor));
  }
  updateNodeCoord(node);
}

function nodesPassThroughToOppositeSide(node) {
  if (node.isDead) return;
  let dx = node.vx * deltaTime;
  let dy = node.vy * deltaTime;
  let newX = node.x + dx,
    newY = node.y + dy;
  if (node.lifespan <= 0) {
    if (DEAD_NODES_STOP || isOffScreen(node)) {
      nodeDeath(node);
      return;
    }
    newX += dx;
    newY += dy;
  }
  if (newX < 0) newX = WIDTH - WIDTH_OFFSET;
  if (newX > WIDTH - WIDTH_OFFSET) newX = 0;

  if (newY < 0) newY = HEIGHT - HEIGHT_OFFSET;
  if (newY > HEIGHT - HEIGHT_OFFSET) newY = 0;

  NODE_GARDEN_GROUP_GRID.updateNode(node, newY, newX);
  NODE_GARDEN_LINE_GRID.updateNode(node, newY, newX);
  node.y = newY;
  node.x = newX;
}

function isOffScreen(node) {
  let x = node.x + node.vx * deltaTime;
  let y = node.y + node.vy * deltaTime;
  return (
    x < 0 || y < 0 || x >= WIDTH - WIDTH_OFFSET || y >= HEIGHT - HEIGHT_OFFSET
  );
}

function nodesCollideWithSides(node) {
  if (node.isDead) return;
  let dx = node.vx * deltaTime;
  let dy = node.vy * deltaTime;
  let dxAbs = Math.abs(node.vx * deltaTime);
  let dyAbs = Math.abs(node.vy * deltaTime);
  let radius = node.diameter / 2;
  let newX = node.x,
    newY = node.y;
  if (node.lifespan <= 0) {
    if (DEAD_NODES_STOP || isOffScreen(node)) {
      nodeDeath(node);
      return;
    }
    newX += dx;
    newY += dy;
  } else {
    if (newX - radius - dxAbs < 0) {
      node.vx *= -1;
      newX = radius + dxAbs;
    } else if (newX + radius + dxAbs > WIDTH - WIDTH_OFFSET) {
      node.vx *= -1;
      newX = WIDTH - WIDTH_OFFSET - dxAbs - radius;
    } else {
      newX += dx;
    }
    if (newY - radius - dyAbs < 0) {
      node.vy *= -1;
      newY = radius + dyAbs;
    } else if (newY + radius + dyAbs > HEIGHT - HEIGHT_OFFSET) {
      node.vy *= -1;
      newY = HEIGHT - HEIGHT_OFFSET - dyAbs - radius;
    } else {
      newY += dy;
    }
  }

  NODE_GARDEN_GROUP_GRID.updateNode(node, newY, newX);
  NODE_GARDEN_LINE_GRID.updateNode(node, newY, newX);
  node.y = newY;
  node.x = newX;
}

function nodeDeath(node) {
  node.lifespan = 0;
  node.vx = 0;
  node.vy = 0;
  DEAD_NODES.push(node);
  node.isDead = true;
  if (!DEAD_NODES_STOP) {
    NODE_GARDEN_GROUP_GRID.removeNode(node);
    NODE_GARDEN_LINE_GRID.removeNode(node);
  }
}

function debugGrid(grid) {
  push();
  strokeWeight(0.07);
  stroke(textBackgroundColour);

  for (let y = 0; y < HEIGHT - HEIGHT_OFFSET; y += grid.cellSize) {
    for (let x = 0; x < WIDTH - WIDTH_OFFSET; x += grid.cellSize) {
      line(x, 0, x, HEIGHT);
      line(0, y, WIDTH, y);
    }
  }

  for (let y = 0; y < HEIGHT - HEIGHT_OFFSET; y += grid.cellSize)
    text(Math.floor(y / grid.cellSize), 0, y, 5);
  for (let x = 0; x < WIDTH - WIDTH_OFFSET; x += grid.cellSize)
    text(Math.floor(x / grid.cellSize), x, 0, 5);
  pop();
}

function debugNodes(grid, representative) {
  if (!representative) return;
  push();
  let i = Math.floor(representative.y / grid.cellSize);
  let j = Math.floor(representative.x / grid.cellSize);
  let nodeCount = 0;
  stroke(debugColour);
  fill(debugColour);
  for (let dy = -1; dy <= 1; ++dy) {
    for (let dx = -1; dx <= 1; ++dx) {
      let lineX = Math.max(0, (j + dx) * grid.cellSize);
      let lineY = Math.max(0, (i + dy) * grid.cellSize);
      strokeWeight(2);

      line(lineX, lineY, lineX + grid.cellSize, lineY);
      line(lineX, lineY, lineX, lineY + grid.cellSize);
      line(
        lineX,
        lineY + grid.cellSize,
        lineX + grid.cellSize,
        lineY + grid.cellSize
      );
      line(
        lineX + grid.cellSize,
        lineY,
        lineX + grid.cellSize,
        lineY + grid.cellSize
      );
      for (let adjacentNode of grid.getCell(
          representative.y,
          representative.x,
          dy,
          dx
        )) {
        strokeWeight(adjacentNode.diameter);
        point(adjacentNode.x, adjacentNode.y);
        adjacentNode.marked = true;
        strokeWeight(0.07);
        text(nodeCount++, adjacentNode.x, adjacentNode.y);
      }
    }
  }
  strokeWeight(1);
  if (!representative.isDead) {
    line(
      representative.x,
      representative.y - 15,
      representative.x,
      representative.y + 15
    );
    line(
      representative.x - 15,
      representative.y,
      representative.x + 15,
      representative.y
    );
  }
  pop();
}

function drawNodeGardenHeader() {
  push();
  fill(textBackgroundColour);
  noStroke();
  rect(0, 0, WIDTH, HEIGHT_OFFSET);
  stroke(textColour);
  fill(textColour);
  strokeWeight(0.1);
  textSize(12);
  text(
    `Moving Nodes:${
      Math.min(MAX_NUMBER_OF_NODES, NODES.length) - DEAD_NODES.length
    }\nStopped Nodes:${DEAD_NODES.length}`,
    WIDTH - 120,
    5,
    120
  );
  strokeWeight(1);
  textSize(16);
  text(`Node Garden`, 5, 5, WIDTH * 0.66);

  strokeWeight(0.1);
  textSize(10);
  text(`Click to Debug Grids`, 5, 22, 100);

  fill(debugColour);
  stroke(DEAD_NODE_COLOUR);
  rect(100, 20, 18, 12);
  fill(DEAD_NODE_COLOUR);
  rect(124, 20, 18, 12);
  pop();
}

function isDebugGroupClick(x, y) {
  return 100 <= x && x <= 118 && 20 <= y && y <= 32;
}

function isDebugLineClick(x, y) {
  return 124 <= x && x <= 142 && 20 <= y && y <= 32;
}

function getGenerateRandomColours() {
  const hashSet = new Set();
  hashSet.add(BACKGROUND_COLOUR);
  hashSet.add(HEALTHY_NODE_COLOUR);
  hashSet.add(DEAD_NODE_COLOUR);
  hashSet.add(TEXT_COLOUR);
  hashSet.add(TEXT_BACKGROUND_COLOUR);
  hashSet.add(LINE_COLOUR);
  while (nodeGroupColours.length < MAX_GROUP_NODES) {
    const c = getRandomColour();
    if (!hashSet.has(c)) {
      hashSet.add(c);
      nodeGroupColours.push(c);
      let lineC = color(c);
      lineC.setAlpha(alpha(c) >> 1);
      nodeGroupLineColours.push(lineC);
    }
  }
}

function getRandomColour() {
  strBuff[0] = "#";
  for (let i = 1; i < strBuff.length; ++i) {
    strBuff[i] = HEX_ALPHA.charAt(random(0, HEX_ALPHA.length));
  }
  return color(strBuff.join(""));
}