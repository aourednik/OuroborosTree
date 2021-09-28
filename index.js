/*

IDEOGRAPH - explore ideologies of political parties with SPAQRL requests to WikiData, D3 and PixiJS.

Copyright (C) 2021 André Ourednik

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

let endpoint = "https://sparql.uniprot.org/sparql/?query=";
// messages:
let loadinginfo = d3.select("#loadinginfo");
let loadingCountries = d3.select("#loadingCountries");
let countriesLoaded = d3.select("#countriesLoaded");
let loadingGraph = d3.select("#loadingGraph");
let constructingGraph = d3.select("#constructingGraph");
let updatingGraph = d3.select("#updatingGraph");
let loadinginfotext = "";
// neccessary globals
let graph, graphstore, canvas, csvdata, cluster ; 
let taxNums = selectedDiets = [];
let prefixes = `
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    PREFIX wikibase: <http://wikiba.se/ontology#>
    PREFIX wdt: <http://www.wikidata.org/prop/direct/>
    PREFIX wd: <http://www.wikidata.org/entity/>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX taxon: <http://purl.uniprot.org/taxonomy/>
    PREFIX up: <http://purl.uniprot.org/core/>
`;


/* A inclure comme info :

Propriétés médicinales
Statut de protection
Interdiction par les religions
Proscrits par des régimes alimentaires

Faire un croisement montrant ce qu'on peut manger si on est musulman végan sotogène

*/

// INITIALISATION
// document.getElementById("upgradeGraphButton").disabled = true; 
getCSVdataAndWriteSPARQLreqs()
/** Writes the SPARQL queries using the list of pertinent organisms (ourobase) and rq templates */
async function getCSVdataAndWriteSPARQLreqs(){
    csvdata = await d3.csv("ourobase.csv");
    // let taxNums = [4513, 3624, 3705, 3654,4550,4498,4543, 7962, 4557, 4564, 4577, 4530, 1288821, 52838, 3435, 51240, 55513, 3337, 32201, 3818, 60698, 13451, 13894, 134033, 171929, 3645, 21020, 3758, 3746, 36610, 3755, 2708, 3760, 23211, 23216, 158314, 27601, 9721, 6451, 2769, 2822, 38516, 2510777, 2786, 154467, 9974,9986, 8839, 8843, 999306, 4136, 59557,5193, 36066, 234819, 29892, 5353, 5320, 5341, 4111, 4081, 4072, 34878, 9870, 7705, 9823, 2706543, 1681, 2607531, 4113, 4039, 9606, 2496636, 6536, 3750, 57918, 9796, 9031,3603,2651130,3494,2653404,2476907,576191,62784,8574,42229,180763,9940,2777923,36774];
    csvdata.forEach(row => taxNums.push(parseInt(row.taxnum)));
    addDietList();
    let taxons = "taxon:" + taxNums.join(" taxon:");
    // taxons' parents
    let taxonParents = await (await fetch('sparql/Parents.rq')).text(); 
    taxonParents = endpoint + encodeURIComponent(prefixes + taxonParents.replace("JSVAR:TAXONS",taxons).replace("/#.*/gm",''));
    // taxons' parents' parents'
    let taxonParentsParents = await (await fetch('sparql/ParentsParents.rq')).text(); ;
    taxonParentsParents = endpoint + encodeURIComponent(prefixes + taxonParentsParents.replace("JSVAR:TAXONS",taxons).replace("/#.*/gm",''));
    // this fetches the missing connections to the main taxons
    let superTaxonsParents = await (await fetch('sparql/SuperTaxonsParents.rq')).text(); 
    superTaxonsParents = endpoint + encodeURIComponent(prefixes + superTaxonsParents.replace("/#.*/gm",''));
    getGraphData(taxonParents,taxonParentsParents,superTaxonsParents);
}

async function fetchWikiData(req) {
    let response = await fetch(req, {headers: { "Accept": "text/csv"}});  
    let text = await response.text(); 
    // remove rdf types of itegers
        const regex = /("([0-9]?)"\^\^.*)/gm;
        const subst = `$2`;
        text = text.replace(regex, subst);
    //
    //console.log(text);
    let data = Papa.parse(text,{
        header:true,
        skipEmptyLines:true,
        transformHeader: function(h) {return h.trim();} , // remove white spaces from header vars
        transform: function(h) {
            return h
                .replace("http://purl.uniprot.org/core/Superkingdom", 1 )
                .replace("http://purl.uniprot.org/core/Kingdom", 2 )
                .replace("http://purl.uniprot.org/core/Phylum", 3 )
                .replace("http://purl.uniprot.org/core/Class", 4 )
                .replace("http://purl.uniprot.org/core/Order", 5 )
                .replace("http://purl.uniprot.org/core/Family", 6 )
                .replace("http://purl.uniprot.org/core/Genus", 7 )
                .replace("http://purl.uniprot.org/core/Species", 8 )
            ;
        }
    });
    data = data.data;
    return data ;
}

// Constructs a list of countnries to choose from. 
// On first run, launch graph construction.
async function addDietList() { 
    // loadinginfo.style('display', 'block');
    // loadingCountries.style('display', 'block');  
    let diets = [];
    for ( var column in csvdata[0] ) {
        diets.push( column ); // Outputs: foo, fiz or fiz, foo
    }
    diets = diets.filter(t=> !["id","taxnum","label","group"].includes(t) );
    console.log(diets);
    diets.sort((a,b) => (a > b) ? 1 : ((b > a) ? -1 : 0));
    let dietsdiv = d3.select("#dietselector");
    diets.forEach(c=>{
        let newdiv = dietsdiv.append("div")
        let cval = c;
        let cid = c;
        newdiv
            .append("input")
            .attr("type","checkbox")
            .attr("name", c)
            .attr("id",cid)
            .attr("value", cval) 
            .attr("onclick","dietApply()")
        ;
        newdiv
            .append("label")
            .append("a")
            //.attr("href",c.country)
            //.attr("target","_blank")
            .text(c)
        ;
    });
    // Europe.forEach(cval => document.getElementById(cval.replace("wd:","c")).checked = true);
    // loadingCountries.style('display', 'none');
    // countriesLoaded.style('display', 'block');
}

async function getGraphData(parents,parentsParents,superParents) {   
    loadinginfo.style('display', 'block');
    loadingGraph.style('display', 'block');
    let [dataParents, dataParentsParents, dataSuperParents] = await Promise.all([
        fetchWikiData(parents), 
        fetchWikiData(parentsParents),
        fetchWikiData(superParents)
    ]);
    let nodes = [];
    let links = [];
    function addLineToGraph(line){
        if (typeof line.taxon !== "undefined" & typeof line.parent !== "undefined") {
            nodes.push({
                id: line.taxon, 
                taxnum: parseInt(line.taxon.match(/([0-9]*)$/g)[0]),
                sciencename : line.name,
                label : line.commonName == "" ? line.name : `${line.name} (${line.commonName})` ,
                rank : parseInt(line.rank)  
            }) ;
            nodes.push({
                id: line.parent, 
                taxnum: parseInt(line.parent.match(/([0-9]*)$/g)[0]),
                sciencename : line.name,
                label : line.parentCommonName == "" ? line.parentName : `${line.parentName} (${line.parentCommonName})` ,
                rank : parseInt(line.rankparent) 
            }) ;
            links.push({
                source: line.taxon,
                target: line.parent,
                value: Math.pow(6 / parseInt(line.rank),2) * 20
            });
        }
    };
    dataParents.forEach((line)=>{ addLineToGraph(line)});
    dataParentsParents.forEach((line)=>{ addLineToGraph(line)});
    dataSuperParents.forEach((line)=>{ addLineToGraph(line)});
    nodes = nodes.filter((e, i) => nodes.findIndex(a => a.id === e.id) === i); // get only unique nodes.
    // links = links.filter((e, i) => links.findIndex(a => a.id === e.id) === i); // get only unique links.
    // nodes.forEach(n=> n.allowed = taxNums.includes(n.taxnum) ? Math.floor(Math.random() * 3) : 9999)

    // construct hierarhy coordinates:
    var purelinks = JSON.parse(JSON.stringify(links)); // we need this to be immutable
    purelinks.push({source:"http://purl.uniprot.org/taxonomy/131567",target:""});
    var counts = {};
    var stratifyFunction = d3.stratify()
        .id(function(d) { 
            if (!counts[d.source]){
                counts[d.source] = 1;
                return d.source;
            } else {
                return d.source + " " + ++counts[d.source];
            }
        })
        .parentId(function(d) { return d.target; })
    ;
    var root = stratifyFunction(purelinks);
    var clusteringFunction = d3.tree();
    cluster = clusteringFunction(root);
    function radial(angle,radius){
        let x = radius * Math.sin(Math.PI * 2 * angle / 360);
        let y = radius * Math.cos(Math.PI * 2 * angle / 360);
        return {x:x,y:y};
    }
    nodes.forEach(n=>{
        let clusterCoords = cluster.descendants().filter(cd=>cd.id == n.id)[0];
        let fxfy = radial(clusterCoords.x*360,clusterCoords.y);
        n.fx = fxfy.x * 2000;
        n.fy = fxfy.y * 2000;      
        // let rad = radial(fx)
        // n.fx = clusterCoords.x * 10000;
        // n.fy = - clusterCoords.y * 5000;
    });

    // transform coordinates to angle and radius


    ///

    graph = {links:links,nodes:nodes};
    // store the full graph for later use
    graphstore = Object.assign({}, graph);
    // draw the hierarchical graph
    drawGraph(graph);
    fetchImages();
}

// fetch images from iNaturalist
async function fetchImages(){
    let requests = [];
    graph.nodes.filter(n=>n.rank>2).forEach(n=>{
        requests.push({
            nid:n.id,
            req:"https://api.inaturalist.org/v1/taxa?q="+n.sciencename//+"&rank=class%2Corder%2Cfamily%2Cgenus%2Cspecies"
        });
    })
    await Promise.all(requests.map(async (req) => {
        try {
            let response = await fetch(req.req,{
                headers: { "Accept": "application/json"}
                // mode: 'no-cors'
            }); 
            if (response.status < 400) {
                let res= await response.json(); 
                if(res.total_results > 0){
                    let node = graph.nodes.filter(n=>n.id==req.nid)[0];
                    node.img = res.results[0].default_photo;
                    console.log(node.img);
                }
            }
        } catch(err){
            console.log(err)
        }
    }));
    console.log(graph.nodes.filter(n=>n.img));
}

function dietApply(){
    // selectedDiets = ["vegan","islam_hanafi"];
    selectedDiets = [];
    let boxes = d3.selectAll("input[type='checkbox']:checked")
        boxes._groups[0].forEach(b=>{
            selectedDiets.push(b.value)
        });
    graph.nodes.forEach(n=> {
        n.allowed = taxNums.includes(n.taxnum) ? 2 : 9999;
        if (selectedDiets.length > 0){
            let prohibitionStatus = [];
            let csvrow = csvdata.filter(r=> r.taxnum == n.taxnum)[0];
            if (typeof csvrow !== "undefined") {
                selectedDiets.forEach(diet=> {
                    prohibitionStatus.push(parseInt(csvrow[diet]))
                });
                n.allowed = Math.min(...prohibitionStatus);
            }
        } 
    });
    dietVisualRender();
}

function dietGenerate(){
    graph.nodes.forEach(n=> {
        n.allowed = taxNums.includes(n.taxnum) ? Math.floor(Math.random() * 3) : 9999;
    });
    dietVisualRender();
}

function dietVisualRender(){
    // propagate to taxons below
    for (let i = 8; i > 1; i--) { 
        graph.nodes.filter(n => n.rank == i).forEach(n=> {   
            let taxonBelow = graph.links.filter(l => l.source.taxnum == n.taxnum)[0];
            if (typeof taxonBelow !== "undefined") {
                let newPermisson = 
                    [9999,n.allowed].includes(taxonBelow.target.allowed) ? 
                        n.allowed : 
                        (n.allowed == 2 & taxonBelow.target.allowed == 1) | (n.allowed == 1 & taxonBelow.target.allowed == 2) ?
                            1 :
                            9998
                    ;
                // console.log("rank: " + (i-1) + " current: " + taxonBelow.target.allowed + " incomming: " + n.allowed + " new: " + newPermisson);
                taxonBelow.target.allowed = newPermisson ; 
            }
        });
    }
    graph.nodes.forEach(n=> {
        n.gfx.clear();
        n.gfx.lineStyle(0.5, 0xFFFFFF);
        n.gfx.beginFill(colour(n.allowed));
        n.gfx.drawCircle(0, 0, n.radius );
        n.gfx.interactive = true;
        n.gfx.hitArea = new PIXI.Circle(0, 0, n.radius);
        n.gfx.mouseover = function(ev) { showHoverLabel(n, ev)};
        // n.gfx.on("pointerdown", function(ev) { focus(n,ev);}); 
        n.gfx
            .on('mousedown', onDragStart)
            .on('touchstart', onDragStart)
            .on('mouseup', onDragEnd )
            .on('mouseupoutside', onDragEnd )
            .on('touchend', onDragEnd)
            .on('touchendoutside', onDragEnd)
            .on('mousemove', onDragMove)
            .on('touchmove', onDragMove)
        ;
        n.lgfx.style.fill = colour(n.allowed);
        // n.lgfx.resolution = 2; // so that the text isn't blury
        // n.gfx._fillStyle.color = colour(n.allowed);
    });  

}

let width = screen.availWidth, height = screen.availHeight;
function colour(num){
    if (num == 0) {return 0xff0000;}
    if (num == 1) {return 0xfbb117;}
    if (num == 2) {return 0x679327;}
    else return 0x013220 ;
}

// FORCES 

let simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id((d) => d.id).strength(0.8))
    .force('charge', d3.forceManyBody().strength(d=> d.rank < 4 ? -3000 : Math.sqrt(d.rank + 1) * -350))
    .force("r", d3.forceRadial(d =>  Math.pow(d.rank,1.1) * 350).strength(0.9))
    // .force('center', d3.forceCenter(width / 2, height / 2) )
    .force("x", d3.forceX(width / 2).strength(0.05)) // this force makes the circle arc's angle less wide
    .force("y", d3.forceY(height / 2).strength(0.05))
    .force("collide",d3.forceCollide().radius(d =>  (1000 / d.rank) * d.radius * 50)) // d => d.radius  is slow
    .alphaDecay(0.05)
;

let app = new PIXI.Application({
    width : width, 
    height : height ,
    antialias: !0, 
    transparent: !0, 
    resolution: 1
}); // Convenience class that automatically creates the renderer, ticker and root container.
document.body.appendChild(app.view);

// DRAW GRAPH

// https://observablehq.com/@d3/tidy-tree
  
function drawGraph(graph) {
    constructingGraph.style('display', 'block');
    console.log(graph);

    // TRANSFORM THE DATA INTO A D3 GRAPH
    simulation
        .nodes(graph.nodes)
        .on('tick', ticked) // this d3 ticker can be replaced by PIXI's "requestAnimationFrame" but the system is then too excited
        .force('link')
          .links(graph.links);    
    
    // count incoming links to set node sizes, and remove nodes with no radius, stemming from super-ideologies
    graph.links.forEach(function(link){
        if (!link.target["linkCount"]) link.target["linkCount"] = 0;
        link.target["linkCount"]++;    
    });
    graph.nodes.forEach((node) => {
        node.radius = 
            node.rank == 0 ? 40 : 
            node.rank < 3 | taxNums.includes(node.taxnum) ? 15 : 
            5  ;
    });
    graph.links = graph.links.filter(l => ! isNaN(l.source.radius));
    // remove freely floating nodes
    graph.nodes = graph.nodes.filter(n =>  graph.links.filter(l => 
        l.source == n | l.target == n
    ).length > 0 );

    // Render with PIXI ------

    // let layerLinks = new PIXI.display.Layer(); // does not work
    // see more here: https://github.com/pixijs/layers/wiki


    // the LINKS are just one object that actually gets drawn in the ticks:
    let containerLinks = new PIXI.Container();
    let links = new PIXI.Graphics();
    containerLinks.addChild(links);

    // render NODES

    let containerParties = new PIXI.Container();
    let containerIdeologies = new PIXI.Container();
    // https://stackoverflow.com/questions/36678727/pixi-js-drag-and-drop-circle
    graph.nodes.forEach((node) => {
        node.gfx = new PIXI.Graphics();
        node.gfx.lineStyle(0.5, 0xFFFFFF);
        node.gfx.beginFill(colour(node.allowed));
        node.gfx.drawCircle(0, 0, node.radius + 20 );
        node.gfx.interactive = true;
        node.gfx.hitArea = new PIXI.Circle(0, 0, node.radius + 20);
        node.gfx.mouseover = function(ev) { showHoverLabel(node, ev)};
        //node.gfx.on("pointerdown", function(ev) { focus(node,ev);}); 
        node.gfx
           .on('mousedown', onDragStart)
           .on('touchstart', onDragStart)
           .on('mouseup', onDragEnd )
           .on('mouseupoutside', onDragEnd )
           .on('touchend', onDragEnd)
           .on('touchendoutside', onDragEnd)
           .on('mousemove', onDragMove)
           .on('touchmove', onDragMove)
        ;
        
        if (node.rank<=1) containerParties.addChild(node.gfx);
        if (node.rank>1) containerIdeologies.addChild(node.gfx);
        // stage.addChild(node.gfx);

        if (node.rank < 9) {
            node.lgfx = new PIXI.Text(
                node.label, {
                    fontFamily : 'Maven Pro', 
                    fontSize: node.rank < 8 ? 10 + node.radius : 30, 
                    fill : colour(node.allowed), 
                    align : 'center'
                }
            );
            node.lgfx.resolution = 2; // so that the text isn't blury
            containerIdeologies.addChild(node.lgfx);
        }
    });


    containerLinks.zIndex = 0;
    containerIdeologies.zIndex = 2;
    containerParties.zIndex = 1;
    app.stage.addChild(containerLinks);
    app.stage.addChild(containerParties);
    app.stage.addChild(containerIdeologies);
    app.stage.children.sort((itemA, itemB) => itemA.zIndex - itemB.zIndex);

    // dragging the nodes around is perhaps less useful than zooming
    canvas = d3.select(app.view)
    /*
    canvas.call(
        d3.drag()
            .container(app.view)
            .subject(() => simulation.find(
                d3.event.x, d3.event.y
            ))
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended)
    )
    */
    canvas.call(
        d3.zoom().scaleExtent([0.1, 3]).on("zoom", zoomAndPan)
    );

    dietGenerate(); // this function only works once the graph has been reformatted to d3


    // ticked()
    function ticked() {
        // requestAnimationFrame(ticked); //this d3 on.ticker can be replaced by PIXI's "requestAnimationFrame" but the system is then too excited. See above
        graph.nodes.forEach((node) => {
            let { x, y, gfx, lgfx, radius } = node;
            gfx.position = new PIXI.Point(x, y);
            if (node.rank > 0) lgfx.position = new PIXI.Point(x + radius / 2, y + radius /2) 
            else lgfx.position = new PIXI.Point(x - 400, y - radius /2) 
        });
        links.clear();
        links.alpha = 0.6;
        graph.links.forEach((link) => {
            let { source, target } = link;
            let color = link.source.gfx._fillStyle.color;
            links.lineStyle(
                Math.pow(link.value,0.6), 
                color ,
                link.alpha
            );
            links.moveTo(source.x, source.y);
            links.lineTo(target.x, target.y);
        });
        links.endFill();
        // renderer.render(stage); // not necessary if using app.

        // when this point is reached, the notification about loading can be removed
        loadinginfo.style('display', 'none');
        constructingGraph.style('display', 'none');
        //document.getElementById("upgradeGraphButton").disabled = false; 
    }

    graph.nodes.forEach(n=>n.fx=n.fy=null); // free the nodes
    
    simulation.alphaTarget(0.02).restart(); // give it an initial push
    // trying to set initial zoom
    app.stage.scale.x = app.stage.scale.y = 0.16;
    app.stage.x = width/2 ;
    app.stage.y = height/2;
}

// DRAG, PAN AND ZOOM

// You can programmatically trigger a zoom event prior to rendering anything. The easiest way to do so is to use:
// selection.call(zoom.transform, d3.zoomIdentity.translate(x,y).scale(k));


// this is triggered from the canvas that calls on D3
var transform = {k:1,x:0,y:0};
function zoomAndPan() {
    // console.log(d3.event.transform);
    transform = d3.event.transform;
    app.stage.scale.x = app.stage.scale.y = d3.event.transform.k;
    if (!draggingNode ) {
        app.stage.x = transform.x;
        app.stage.y = transform.y;
    }
}

// this is called by a node
let draggingNode = false;
function onDragStart(event){
    simulation.alphaTarget(0.02).restart();
    this.dragging = true;
    draggingNode = true;
    this.data = event.data;
    var newPosition = this.data.getLocalPosition(this.parent);
    let node = graph.nodes.filter(n=> n.gfx == this)[0];
    node.fx = newPosition.x;
    node.fy = newPosition.y;
    let subnodes = new Set; // sets only contain unique values.
    graph.links.filter(l=> l.target == node).forEach(l=> {
        subnodes.add(l.source);
        graph.links.filter(ll=> ll.target == l.source).forEach(ll=> {
            subnodes.add(ll.source);
            graph.links.filter(lll=> lll.target == ll.source).forEach(lll=> {
                subnodes.add(lll.source);
                graph.links.filter(llll=> llll.target == lll.source).forEach(llll=> {
                    subnodes.add(llll.source);
                    graph.links.filter(lllll=> lllll.target == llll.source).forEach(lllll=> {
                        subnodes.add(lllll.source);
                    });
                });
            });
        });
    });
    subnodes = Array.from(subnodes); 
    console.log(subnodes);
    subnodes.forEach(sn=> {
        sn.fx = newPosition.x;
        sn.fy = newPosition.y;
    })    
}
function onDragEnd(){
    this.dragging = false;
    draggingNode = false;
    this.data = null;
    let node = graph.nodes.filter(n=>n.gfx == this)[0];
    node.fx = null;
    node.fy = null;
    let subnodes = new Set; // sets only contain unique values.
    graph.links.filter(l=> l.target == node).forEach(l=> {
        subnodes.add(l.source);
        graph.links.filter(ll=> ll.target == l.source).forEach(ll=> {
            subnodes.add(ll.source);
            graph.links.filter(lll=> lll.target == ll.source).forEach(lll=> {
                subnodes.add(lll.source);
                graph.links.filter(llll=> llll.target == lll.source).forEach(llll=> {
                    subnodes.add(llll.source);
                    graph.links.filter(lllll=> lllll.target == llll.source).forEach(lllll=> {
                        subnodes.add(lllll.source);
                    });
                });
            });
        });
    });
    subnodes = Array.from(subnodes); 
    console.log(subnodes);
    subnodes.forEach(sn=> {
        sn.fx = null;
        sn.fy = null;
    }) 
}
function onDragMove(){
    if (this.dragging){
        var newPosition = this.data.getLocalPosition(this.parent);
        let node = graph.nodes.filter(n=>n.gfx == this)[0];
        node.fx = newPosition.x;
        node.fy = newPosition.y;
        let subnodes = new Set; // sets only contain unique values.
        graph.links.filter(l=> l.target == node).forEach(l=> {
            subnodes.add(l.source);
            graph.links.filter(ll=> ll.target == l.source).forEach(ll=> {
                subnodes.add(ll.source);
                graph.links.filter(lll=> lll.target == ll.source).forEach(lll=> {
                    subnodes.add(lll.source);
                    graph.links.filter(llll=> llll.target == lll.source).forEach(llll=> {
                        subnodes.add(llll.source);
                        graph.links.filter(lllll=> lllll.target == llll.source).forEach(lllll=> {
                            subnodes.add(lllll.source);
                        });
                    });
                });
            });
        });
        subnodes = Array.from(subnodes); 
        console.log(subnodes);
        subnodes.forEach(sn=> {
            sn.fx = newPosition.x;
            sn.fy = newPosition.y;
        });
    }
}


// Unselect All stuff

function unSelectAllCountries(){
    let allBoxes = d3.selectAll("input[type='checkbox']");
    allBoxes._groups[0].forEach(b=>{b.checked = false});
}

function selectGroupAndUpdate(group){
    console.log(group);
    unSelectAllCountries();
    let allBoxes = d3.selectAll("input[type='checkbox']");
    allBoxes._groups[0].forEach(b=>{
        if (group.includes(b.value)) b.checked = true
    });
    updateGraph();
}

// Graph hover and highlight -------

let rootSelectedNode = {};

// https://observablehq.com/@d3/drag-zoom

function showHoverLabel(node,ev) {
    let nodex = (ev.data.global.x + 15) ;
    let nodey = (ev.data.global.y - 15)  ;
    d3.select("#label")
        .attr("style", "left:"+nodex+"px;top:"+nodey+"px;display:block")
        .select("a")
        .attr("href",node.id.replace("wd:","http://www.wikidata.org/entity/"))
        .attr("target","_blank")
        .text(node.label) 
    ;
    if (typeof node.img !== "undefined") {
        d3.select("#label").select("img").attr("src",node.img.medium_url);
    }  else {
        d3.select("#label").select("img").attr("src",null);
    } 
}
function hideLabel() {d3.select("#label").attr("style", "display:none")}

function focus(d,ev) {
    //console.log(d);
    showHoverLabel(d,ev); // nececessary for touch screen
    if (rootSelectedNode == d) {
        unfocus();
    } else {
        rootSelectedNode = d;
        markSelected(d);
    }
    updateColor();  
}

function unfocus() {
    graph.nodes.forEach(n => {n.marked = true});
    graph.links.forEach(l => {l.marked = true});
    rootSelectedNode = {};
}

function markSelected(d){
    graph.nodes.forEach(n => {n.marked = false})
    graph.links.forEach(l => {l.marked = false})
    d.marked = true;
    let linked = [];
    graph.links.filter(l => 
        l.source == d | l.target == d
    ).forEach(l => {
        l.marked = true;
        linked.push(l.source.id);
        linked.push(l.target.id)
    });
    graph.nodes.forEach(n => n.marked = linked.includes(n.id) ? true : false)
}

function updateColor() {
    graph.nodes.filter(n => !n.marked).forEach(n => {
        n.gfx.alpha = 0.2; 
        if (n.rank < 8) n.lgfx.alpha=0.2
    });
    graph.links.filter(l => !l.marked).forEach(l => l.alpha = 0.1 );
    graph.nodes.filter(n => n.marked).forEach(n => {
        n.gfx.alpha = 1; 
        if (n.rank < 8) n.lgfx.alpha =1
    });
    graph.links.filter(l => l.marked).forEach(l => l.alpha = 1);
}



// Graph updates ------------

function updateGraph(){
        document.getElementById("upgradeGraphButton").disabled = true; 
        simulation.stop();
        graph = graphstore = null;
        loadinginfo.style('display', 'block');
        updatingGraph.style('display', 'block');
        let checked = [];
        let boxes = d3.selectAll("input[type='checkbox']:checked")
        boxes._groups[0].forEach(b=>{
            checked.push(b.value)
        });
        console.log(checked);
        app.stage.removeChildren();
        let reqGraph = makeGraphReq(checked);
        let reqGraphExtra = makeGraphExtraReq(checked);
        // wait before launching
        getGraphData(reqGraph,reqGraphExtra);
}

// TODO add element without destroying everything
function restoreGraph(){
    // add all elements to graph removed by previous filter
    graphstore.nodes.forEach(sn => {
        if (graph.nodes.filter(n=> n.id == sn.id).length==0) graph.nodes.push(Object.assign({}, sn));
    })
    // TODO : something's wrong with attaching those links
    graphstore.links.forEach(sl => {
        if (graph.links.filter(l=> l.id == sl.id).length==0) graph.links.push(Object.assign({}, sl));
    })
    // relink nodes correcly
    graph.links.forEach(l => {
        l.source = graph.nodes.filter(n=> n.id == l.source.id)[0];
        l.target = graph.nodes.filter(n=> n.id == l.target.id)[0];
    });
}


// UTILITIES

function exportCSV() {
    let csv = Papa.unparse(graph.nodes.filter(n=> taxNums.includes(n.taxnum)));
    console.log(csv);
}

