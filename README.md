# Cool Node Garden v0.0.3
### Description 

A while ago I saw a cool background effect for a *api-secret-sharing-service* I use at work. 
The effect is bassically described as a bunch of nodes which can be linked by a thin line if they are at a certain distance from each other.

### Changelog

[v] Normal Nodes - nodes which do not have any special properties
[v] Line Nodes   - nodes which try to connect to other nodes with a thin line based on their distance
[v] Group Nodes  - larger nodes with a randomly assigned colour which can extend to other types of nodes; group nodes are also line nodes with a larger line distance
[v] node aging which affects node velocity
[v] opt* nodes stop after death (lifespan reaches 0)
[v] opt* nodes drift offscreen after death
[v] opt* nodes collide with canvas boundary
[v] opt* nodes pass through canvas boundary and come through the opposite side
[v] opt* draw only N closest distance lines
[v] debug grids for Line and Group nodes

### Ideas
[x] Node collision
[x] Node attraction
[x] Node repelling
[x] Node dragging
[x] Create artificial boundary inside canvas, so nodes can collide with it or pass through
[x] Voronoi Nodes which can be arranged by some input (img, text, pixels) and given other node properties (lines and colour). Should be immovable so the voronoi can be seen :)

todo add screenshots
