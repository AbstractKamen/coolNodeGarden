// ########################################################################
// ##############################CONFIGURATION#############################
// ########################################################################
const FRAMES = 60;
const WIDTH = Math.floor(window.innerWidth);
const HEIGHT = Math.floor(window.innerHeight);

const INITIAL_NUMBER_OF_NODES = 350;
const MAX_NUMBER_OF_NODES = 5000;
// When mouse is pressed
const MAX_SPAWN_NODES = 200;
const MIN_SPAWN_NODES = 50;
const MIN_LINE_NODES_SPAWN = 5;
const MIN_GROUP_NODES_SPAWN = 3;
const MAX_LINE_NODES = 1919;
// The max distance between nodes where a line could be drawn.
// Also determines the `NODE_GARDEN_LINE_GRID` cell size.
const MAX_NODE_LINE_DISTANCE = 170;
const MIN_NODE_LINE_DISTANCE = 45;
const LINE_BIAS_INFLUENCE = 1;
// Draws only the closest # lines
const DRAW_CLOSEST_LINE_LIMIT_MIN = 1;
const DRAW_CLOSEST_LINE_LIMIT_MAX = 9;
const MIN_NODE_DIAMETER = 4;
const MAX_NODE_DIAMETER = 8;

const MOUSE_MAX_NODE_LINE_DISTANCE = 200;
// 0 endless, 1 bounce
const CHOSEN_NODE_COORD_UPDATE_FUNCTION = 1;
/* Adjusts the final grid cell size. The larder the grid cell the higher
 * probability of nodes being needlessly iterated. A lower value means
 * less consistent distance mechanics for a small performance gain.
 */
const GRID_FACTOR = 1;

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
const MAX_GROUP_NODES = 167;
// The maximum range a group node can extend its colour.
// Also determines the `NODE_GARDEN_GROUP_GRID` cell size.
const MAX_NODE_GROUP_PAINT_DISTANCE = 350;
// The minimum range a group node can extend its colour.
const MIN_NODE_GROUP_PAINT_DISTANCE = 155;
// If true all nodes are respawn when mouse is pressed
const REVIVE_ALL = true;
// If true dead nodes just stop else they drift off the canvas
const DEAD_NODES_STOP = false;
const MAX_REVIVED_NODES = 400;
const MAX_VELOCITY = 0.2;
const MIN_VELOCITY = 0.03;
// When it reaches 0 the node will stop moving
const MAX_LIFE_SPAN = 1000;
// The speed of node aging
const AGE_FACTOR = 0.03;

const BACKGROUND_COLOUR = "#153827";
const HEALTHY_NODE_COLOUR = "#417494";
const DEAD_NODE_COLOUR = "#1E1CCAF7";
const LINE_COLOUR = "#7097A8";

const WIDTH_OFFSET = 0;
const HEIGHT_OFFSET = HEIGHT * 0.08;
const REL_MIN_TEXT_SIZE = HEIGHT * 0.01;
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
        this.grid[i][j] = new Map();
      }
    }
  }

  addNode(node) {
    let i = Math.floor(node.y / this.cellSize);
    let j = Math.floor(node.x / this.cellSize);
    this.grid[i][j].set(node.id, node);
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

    this.grid[i1][j1].delete(node.id);
    this.grid[i2][j2].set(node.id, node);
  }

  removeNode(node) {
    let i = Math.floor(node.y / this.cellSize);
    let j = Math.floor(node.x / this.cellSize);
    this.grid[i][j].delete(node.id);
  }

  getCell(y, x, yDir, xDir) {
    let i = Math.floor(y / this.cellSize) + yDir;
    if (i < 0 || i >= this.gridHeight) return EMPTY_CELL;
    let j = Math.floor(x / this.cellSize) + xDir;
    if (j < 0 || j >= this.gridWidth) return EMPTY_CELL;
    return this.grid[i][j].values();
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

const MAX_NODE_LINE_DISTANCE_SQ = MAX_NODE_LINE_DISTANCE * MAX_NODE_LINE_DISTANCE;
const MIN_NODE_LINE_DISTANCE_SQ = MIN_NODE_LINE_DISTANCE * MIN_NODE_LINE_DISTANCE;
const MOUSE_MAX_NODE_LINE_DISTANCE_SQ = MOUSE_MAX_NODE_LINE_DISTANCE * MOUSE_MAX_NODE_LINE_DISTANCE;

const NODES = new Array(INITIAL_NUMBER_OF_NODES);
const GROUP_NODES = new Array(MAX_GROUP_NODES);
const LINE_NODES = new Array(MAX_LINE_NODES);
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
var isPaused = false;
var linePtr = 0;
var groupPtr = 0;

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
    let node = makeNodePerCap(
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
  if (isPaused) return;
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
  pauseIfNotFocused();
}
// https://forum.processing.org/two/discussion/27951/noloop-if-focused.html very helpful :)
function pauseIfNotFocused() {
  if (!focused) {
    if (!isPaused) {
      savedImage = get();
      savedImage.filter(BLUR, 3);
      isPaused = true;
      image(savedImage, 0, 0);
      noLoop();
    }
  } else {
    isPaused = false;
    loop();
  }
}

function drawLineCells() {
  for (let i = 0; i < NODE_GARDEN_LINE_GRID.gridHeight; ++i) {
    for (let j = 0; j < NODE_GARDEN_LINE_GRID.gridWidth; ++j) {
      let currentCell = NODE_GARDEN_LINE_GRID.getCell(i, j, 0, 0);

      for (let k = 0; k < currentCell.length; ++k) {
        let currentNode = currentCell[k];
        for (let l = k + 1; l < currentCell.length; ++l) {
          let adjacentNode = currentCell[k];
        }
      }
    }
  }
}

function drawCurrentNode(currentNode) {
  if (currentNode.isDead && !DEAD_NODES_STOP) return;
  stroke(currentNode.colour);
  strokeWeight(currentNode.diameter);
  point(currentNode.x, currentNode.y);
  drawMouseLine(currentNode);
  drawLineNodeConnections(currentNode);
  drawGroupNodeConnections(currentNode);
}
function drawGroupNodeConnections(currentNode) {
  if (!currentNode.isGroupNode) return;
  for (let dy = -1; dy <= 1; ++dy) {
    for (let dx = -1; dx <= 1; ++dx) {
      for (let adjacentNode of NODE_GARDEN_LINE_GRID.getCell(
          currentNode.y,
          currentNode.x,
          dy,
          dx
        )) {
        if (!adjacentNode.isGroupNode) {
          let dx = adjacentNode.x - currentNode.x;
          let dy = adjacentNode.y - currentNode.y;
          let distance = dx * dx + dy * dy;
          if (MIN_NODE_LINE_DISTANCE_SQ <= distance && distance < currentNode.lineDistSq) {
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
  for (
    let j = 0; !distancesHeap.isEmpty() && j < currentNode.lineNeighbours;
    ++j
  ) {
    let nodeLine = distancesHeap.pop();
    let diff = nodeLine.distance / currentNode.lineDistSq;
    strokeWeight(1 - diff);
    stroke(currentNode.lineColour);
    line(nodeLine.x1, nodeLine.y1, nodeLine.x2, nodeLine.y2);
  }
}

function drawLineNodeConnections(currentNode) {
  if (!currentNode.isLineNode) return;
  for (let dy = -1; dy <= 1; ++dy) {
    for (let dx = -1; dx <= 1; ++dx) {
      for (let adjacentNode of NODE_GARDEN_LINE_GRID.getCell(
          currentNode.y,
          currentNode.x,
          dy,
          dx
        )) {
        if (currentNode.lineGroup != adjacentNode.lineGroup) {
          let dx = adjacentNode.x - currentNode.x;
          let dy = adjacentNode.y - currentNode.y;
          let distance = dx * dx + dy * dy;
          if (MIN_NODE_LINE_DISTANCE_SQ <= distance && distance < currentNode.lineDistSq) {
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
  for (
    let j = 0; !distancesHeap.isEmpty() && j < currentNode.lineNeighbours;
    ++j
  ) {
    let nodeLine = distancesHeap.pop();
    let diff = nodeLine.distance / currentNode.lineDistSq;
    strokeWeight(1 - diff);
    stroke(currentNode.lineColour);
    line(nodeLine.x1, nodeLine.y1, nodeLine.x2, nodeLine.y2);
  }
}

function touchStarted() {
  return mousePressed();
}

function mousePressed() {
  if (isPaused) {
    loop();
    isPaused = !isPaused;
  }
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
        groupRepr.vx = Math.sign(groupRepr.vx) * MAX_VELOCITY / 2;
        groupRepr.vy = Math.sign(groupRepr.vy) * MAX_VELOCITY / 2;
      } else {
        for (groupNode of GROUP_NODES) {
          if (!groupNode.isDead) {
            groupRepr = groupNode;
            groupRepr.lifespan = 1000;
            groupRepr.vx = Math.sign(groupRepr.vx) * MAX_VELOCITY / 2;
            groupRepr.vy = Math.sign(groupRepr.vy) * MAX_VELOCITY / 2;
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
  let minLineNodes = MIN_LINE_NODES_SPAWN;
  let minGroupNodes = MIN_GROUP_NODES_SPAWN;
  if (NODES.length < MAX_NUMBER_OF_NODES) {
    for (let i = NODES.length; i < nodeLimit; ++i) {
      let x = mx + Math.random();
      let y = my + Math.random();
      let node = undefined;
      if (minLineNodes > 0) {
        minLineNodes--;
        node = makeLineNode(x, y);
      } else if (minGroupNodes > 0) {
        minGroupNodes--;
        node = makeGroupNode(x, y);
      } else {
        node = makeNodePerCap(x, y);
      }
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
  let distFactor = currentNode.isGroupNode ? 2 : 0.5;

  let mouseDistance = dMx * dMx + dMy * dMy - currentNode.diameter;
  if (mouseDistance < MOUSE_MAX_NODE_LINE_DISTANCE_SQ * distFactor) {
    let mouseDiff = mouseDistance / (MOUSE_MAX_NODE_LINE_DISTANCE_SQ * distFactor);
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
const HALF_MAX_LINE_DIST = MAX_NODE_LINE_DISTANCE >> 1;
/**
 *  Makes a line node which can connect to plain nodes or 
 *  lined nodes of another lineGroup (2 groups currently)
 * @param {*} x x coord
 * @param {*} y y coord
 * @param {*} node template if reviving node
 * @returns line node or plain node if above capacity
 */
function makeLineNode(x, y, node) {
  let wasUndefined = node == undefined;
  node = makeNode(x, y, node);
  if (wasUndefined && linePtr < MAX_LINE_NODES) {
    node.lineColour = lineColour;
    node.isLineNode = true;
    LINE_NODES[linePtr++] = node;
    node.lineGroup = Math.random() - 1 > 0;
    node.lineDistSq = getRndBias(MIN_NODE_LINE_DISTANCE, HALF_MAX_LINE_DIST, HALF_MAX_LINE_DIST, LINE_BIAS_INFLUENCE);
    node.lineDistSq = node.lineDistSq * node.lineDistSq;
    node.lineNeighbours = DRAW_CLOSEST_LINE_LIMIT_MIN + Math.random() * (DRAW_CLOSEST_LINE_LIMIT_MAX - DRAW_CLOSEST_LINE_LIMIT_MIN);
  } else if (node.isLineNode) {
    node.lineGroup = Math.random() - 1 > 0;
    node.lineDistSq = getRndBias(MIN_NODE_LINE_DISTANCE, HALF_MAX_LINE_DIST, HALF_MAX_LINE_DIST, LINE_BIAS_INFLUENCE);
    node.lineDistSq = node.lineDistSq * node.lineDistSq;
    node.lineNeighbours = DRAW_CLOSEST_LINE_LIMIT_MIN + Math.random() * (DRAW_CLOSEST_LINE_LIMIT_MAX - DRAW_CLOSEST_LINE_LIMIT_MIN);
  }
  return node;
}

// https://stackoverflow.com/questions/29325069/how-to-generate-random-numbers-biased-towards-one-value-in-a-range
function getRndBias(min, max, bias, influence) {
  var rnd = Math.random() * (max - min) + min,   // random in range
      mix = Math.random() * influence;           // random mixer
  return rnd * (1 - mix) + bias * mix;           // mix full range and bias
}
function makeGroupNode(x, y, node) {
  let wasUndefined = node == undefined;
  node = makeNode(x, y, node);
  if (wasUndefined && groupPtr < MAX_GROUP_NODES) {
    node.lineColour = nodeGroupLineColours[groupPtr];
    node.colour = nodeGroupColours[groupPtr];
    node.isGroupNode = true;
    GROUP_NODES[groupPtr++] = node;

    node.diameter = MAX_NODE_DIAMETER * 2;
    node.lifespan = MAX_LIFE_SPAN;
    node.groupDistanceSq =
      MIN_NODE_GROUP_PAINT_DISTANCE +
      Math.random() *
      (MAX_NODE_GROUP_PAINT_DISTANCE - MIN_NODE_GROUP_PAINT_DISTANCE);
    node.groupDistanceSq *= node.groupDistanceSq;
  } else if (node.isGroupNode) {
    node.diameter = MAX_NODE_DIAMETER * 2;
    node.lifespan = MAX_LIFE_SPAN;
    node.groupDistanceSq =
      MIN_NODE_GROUP_PAINT_DISTANCE +
      Math.random() *
      (MAX_NODE_GROUP_PAINT_DISTANCE - MIN_NODE_GROUP_PAINT_DISTANCE);
    node.groupDistanceSq *= node.groupDistanceSq;
  }
  return node;
}

function makeNodePerCap(x, y, node) {
  if (groupPtr < MAX_GROUP_NODES) return makeGroupNode(x, y, node);
  if (linePtr < MAX_LINE_NODES) return makeLineNode(x, y, node);
  return makeNode(x, y, node);
}

function makeNode(
  x = Math.random() * (WIDTH - WIDTH_OFFSET),
  y = Math.random() * (HEIGHT - HEIGHT_OFFSET),
  node = {
    id: nodeIdIndex++,
    colour: nodeColour,
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
  node.lifespan = Math.floor(Math.random() * MAX_LIFE_SPAN);
  node.diameter =
    MIN_NODE_DIAMETER +
    Math.random() * (MAX_NODE_DIAMETER - MIN_NODE_DIAMETER);
  return node;
}


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
    if (currentNode.isGroupNode) {
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
              let distance = dNx * dNx + dNy * dNy;
              if (
                distance < currentNode.groupDistanceSq &&
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
    let agingFactor = (1 - node.lifespan / MAX_LIFE_SPAN) / 200;
    node.vx =
      Math.sign(node.vx) *
      Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, Math.abs(node.vx - node.vx * agingFactor)));
    node.vy =
      Math.sign(node.vy) *
      Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, Math.abs(node.vy - node.vy * agingFactor)));
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
  strokeWeight(0.07);
  textSize(REL_MIN_TEXT_SIZE);
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
        textSize(REL_MIN_TEXT_SIZE);
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
// ui lul
const BTN_WIDTH = HEIGHT_OFFSET * 0.25;
const BTN_HEIGHT = HEIGHT_OFFSET * 0.25;

const debugGroupNodesBtn = {
  x: WIDTH * 0.3,
  y: HEIGHT_OFFSET * 0.50,
  width: BTN_WIDTH,
  height: BTN_HEIGHT
}
const debugLineNodesBtn = {
  x: WIDTH * 0.3,
  y: HEIGHT_OFFSET * 0.75,
  width: BTN_WIDTH,
  height: BTN_HEIGHT
}

function drawNodeGardenHeader() {
  push();
  fill(textBackgroundColour);
  noStroke();
  rect(0, 0, WIDTH, HEIGHT_OFFSET);
  stroke(textColour);
  fill(textColour);
  strokeWeight(0.1);
  textSize(REL_MIN_TEXT_SIZE);
  text(
    `Moving Nodes:${
      Math.min(MAX_NUMBER_OF_NODES, NODES.length) - DEAD_NODES.length
    }\nStopped Nodes:${DEAD_NODES.length}`,
    WIDTH * 0.86,
    HEIGHT * 0.01,
    WIDTH * 0.14
  );
  strokeWeight(HEIGHT_OFFSET * 0.02);
  textSize(HEIGHT_OFFSET * 0.4);
  text(`Node Garden`, WIDTH * 0.005, HEIGHT * 0.01, WIDTH * 0.66);

  strokeWeight(0.1);
  textSize(REL_MIN_TEXT_SIZE);
  text(`Click to Debug Grids`, WIDTH * 0.005, HEIGHT * 0.05, WIDTH * 0.2);

  fill(debugColour);
  rect(debugGroupNodesBtn.x, debugGroupNodesBtn.y, debugGroupNodesBtn.width, debugGroupNodesBtn.height);
  noFill();
  stroke(nodeColour);
  strokeWeight(debugGroupNodesBtn.x * 0.01);
  rect(debugGroupNodesBtn.x, debugGroupNodesBtn.y, debugGroupNodesBtn.width, debugGroupNodesBtn.height);
  fill(DEAD_NODE_COLOUR);
  noStroke();
  rect(debugLineNodesBtn.x, debugLineNodesBtn.y, debugLineNodesBtn.width, debugLineNodesBtn.height);
  noFill();
  stroke(nodeColour);
  strokeWeight(debugLineNodesBtn.x * 0.01);
  rect(debugLineNodesBtn.x, debugLineNodesBtn.y, debugLineNodesBtn.width, debugLineNodesBtn.height);
  pop();
}

function isDebugGroupClick(x, y) {
  return (
    debugGroupNodesBtn.x <= x &&
    x <= debugGroupNodesBtn.x + debugGroupNodesBtn.width &&
    debugGroupNodesBtn.y <= y &&
    y <= debugGroupNodesBtn.y + debugGroupNodesBtn.height);
}

function isDebugLineClick(x, y) {
  return (
    debugLineNodesBtn.x <= x &&
    x <= debugLineNodesBtn.x + debugLineNodesBtn.width &&
    debugLineNodesBtn.y <= y &&
    y <= debugLineNodesBtn.y + debugLineNodesBtn.height);
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