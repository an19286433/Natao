(function () {
    "use strict";

    var uuid = require('node-uuid');
    var _ = require('lodash');
    var fs = require('fs');


    angular
        .module('Natao')
        .service('PrincipalTreeService', PrincipalTreeService)
        .run(run);

    //Start of the service
    function run() {
    }


    //Service itself
    function PrincipalTreeService(PreferencesService,CssService,TemplateTreeService,$q,PendingService,$timeout) {
        console.log('PrincipalTreeService');

        var self = this;
        self.PreferencesService = PreferencesService;
        self.CssService = CssService;
        self.TemplateTreeService = TemplateTreeService;
        self.PendingService = PendingService;
        self.$timeout = $timeout;
        self.$q = $q;
        self.docsMarkdown = [];
        self.principalTree = {
            docName: 'PrincipalTree',
            tree: {
                children:[]
            },
            expandedNodes: [],
            buffer: {
                tree: null,
                documents: []
            }
        };

        self.cutNodePending = null;
        self.exportFileName = null;
        self.docsPendingForBuffer = 0;
        self.nodesPendingPaste = 0;

        self.treeOptions = {
            nodeChildren: "children",
            dirSelectable: true,
            injectClasses: {
                ul: "a1",
                li: "a2",
                liSelected: "a7",
                iExpanded: "a3",
                iCollapsed: "a4",
                iLeaf: "a5",
                label: "a6",
                labelSelected: "a8"
            },
            isLeaf: function(node) {
                return node.leaf;
            }
        };

        self.initBuffer = function() {
            self.principalTree.buffer = {
                tree: null,
                documents: []
            };
        };

        self.getInitTreeService = function(db,defaultCss) {
            self.db = db;

            return self.$q(function(resolve,reject) {

                self.db.find({docName:'PrincipalTree'}, function (err, docs) {
                    if (err || docs.length === 0) {
                        console.log('Principal Document not found');

                        self.principalTree.tree.defaultCss = defaultCss._id;

                        self.db.insert(self.principalTree, function (err, newDoc) {
                            if (err) {
                                reject(err);
                            } else {
                                self.principalTree = newDoc;
                                console.log('principalTree',self.principalTree);

                                //and we save the first version
                                var copyPrincipalTree = {};
                                angular.copy(self.principalTree,copyPrincipalTree);
                                self.PendingService.start();
                                self.db.update({_id: self.principalTree._id }, copyPrincipalTree, {}, function (err) {
                                    self.PendingService.stop();
                                    if (err) {
                                        console.error('error:', err);
                                    }
                                });
                            }
                        });


                    } else {
                        self.principalTree = docs[0];
                        console.log('principalTree', self.principalTree);

                        if (self.principalTree.currentMarkdownId) {
                            self.db.find({
                                docName: 'markdown',
                                _id: self.principalTree.currentMarkdownId
                            }, function (err, docs) {
                                if (err) {
                                    reject(err);
                                } else {
                                    self.currentMarkdown = docs[0];
                                    self.CssService.initCurrentById(self.currentMarkdown.css);
                                }
                            });
                        }
                    }
                    resolve();
                });
            });
        };


        self.save = function() {
            var copyPrincipalTree = {};
            angular.copy(self.principalTree,copyPrincipalTree);
            self.PendingService.start();
            self.db.update({_id: self.principalTree._id }, copyPrincipalTree, {}, function (err,doc) {
                self.PendingService.stop();
                if (err) {
                    console.error('error:', err);
                }
            });
        };

        self.selectNode = function(node) {

            if (node.leaf) {
                if ( !self.principalTree.currentMarkdownId || (self.principalTree.currentMarkdownId && node.id !== self.principalTree.currentMarkdownId)) {
                    self.db.find({docName:'markdown',_id: node.id}, function (err, docs) {
                        if (err) {
                            console.error(err);
                        } else {
                            if (docs && docs.length > 0){
                                self.currentMarkdown = docs[0];
                                self.CssService.initCurrentById(self.currentMarkdown.css);
                                self.principalTree.currentMarkdownId = self.currentMarkdown._id;
                                self.save();

                                setTimeout(self.refreshMath, 100);  //without angular $digest
                            }
                        }
                    });
                }
            }
        };

        self.refreshMath = function() {
            MathJax.Hub.Queue(["Typeset",MathJax.Hub]);
        };

        // if we do the save on the select node, the selected node is not yet set
        //so we have to watch it
        /*self.$rootScope.$watch(function(){
                return self.principalTree.selectedNode;
        },function() {
            self.save();
        });*/

        self.addFolder = function(nodeName,nodeParent,templateName) {
            if (templateName) {
                if (!nodeParent) {
                    nodeParent = self.principalTree.tree;
                }

                var template = self.TemplateTreeService.getTemplate(templateName);
                var newFolder = {};
                angular.copy(template,newFolder);
                newFolder.name = nodeName;
                delete newFolder.docName;

                //We start the pending and count the node to paste
                self.nodesPendingPaste = self.howManyNodes(newFolder);
                self.PendingService.start();

                self.pasteNodefolder(nodeParent,newFolder);
                //the save will be done at the end of the paste action
            } else {
                self.addFolderOnly(nodeName,nodeParent);
                self.save();
            }

        };


        self.addFolderOnly = function(nodeName,nodeParent) {

            var newNode = {
                id: uuid.v4(),
                name: nodeName,
                color: '#000000',
                children:[]
            };

            if (!nodeParent) {
                nodeParent = self.principalTree.tree;
            }
            newNode.defaultCss = nodeParent.defaultCss;
            nodeParent.children.push(newNode);

            //and we open the node parent
            self.principalTree.expandedNodes.push(nodeParent);

            // if the new folder is the first one
            if (!self.principalTree.selectedNode) {
                self.principalTree.selectedNode = newNode;
            }

        };

        self.addClass = function(nameClass,nameTemplate) {
            self.addFolder(nameClass,null,nameTemplate);
        };

        self.addMarkdown = function(node,title) {

            var newMarkDown = {
                docName: 'markdown',
                title: title,
                created: new Date(),
                css: node.defaultCss,
                md: ''
            };

            self.PendingService.start();
            self.db.insert(newMarkDown, function (err, newDoc) {
                self.PendingService.stop();
                if (err) {
                    console.error(err);
                } else {

                    var newNode = {
                        id: newDoc._id,
                        name: newDoc.title,
                        leaf: true
                    };

                    node.children.push(newNode);

                    self.currentMarkdown = newDoc;
                    self.principalTree.currentMarkdownId = newDoc._id;
                    self.CssService.initCurrentById(self.currentMarkdown.css);
                    self.principalTree.selectedNode = newNode;
                    //and we open the node parent
                    self.principalTree.expandedNodes.push(node);
                    self.save();
                }
            });
        };

        //delete of a document
        self.deleteDocument = function(node) {
            self.PendingService.start();
            self.db.remove({ _id: node.id }, {}, function (err, numRemoved) {
                self.PendingService.stop();
                if (err) {
                    console.error(err);
                } else {
                    console.log('removed',numRemoved);
                }
            });
        };

        //copy of a document by its content to a node in the tree
        self.copyDocumentTo = function(originalDoc,nodeParent) {

            var newDocument = {};
            angular.copy(originalDoc, newDocument);
            delete newDocument._id;


            //and then add it to the database
            self.PendingService.start();
            self.db.insert(newDocument, function (err, newDoc) {
                self.PendingService.stop();
                if (err) {
                    console.error(err);
                } else {

                    var newNode = {
                        id: newDoc._id,
                        name: newDoc.title,
                        leaf: true
                    };

                    if (!nodeParent.children) {
                        nodeParent.children = [];
                    }
                    nodeParent.children.push(newNode);
                    self.save();
                }
            });
        };


        //Copy a document and push in  the buffer.documents
        self.copyDocumentInBuffer = function(node) {

            self.db.find({
                docName: 'markdown',
                _id: node.id
            }, function (err, docs) {
                if (err) {
                    console.error(err);
                } else {
                    self.principalTree.buffer.documents.push(docs[0]);
                    self.save();
                }
                self.docsPendingForBuffer--;

                //And delete when the job is done
                if (self.docsPendingForBuffer === 0) {
                    self.PendingService.stop();
                    if ( self.cutNodePending) {
                        //it's a cut, so have to delete the node
                        self.deleteNode(self.cutNodePending);
                        self.cutNodePending = null;
                    } else {
                        if (self.exportFileName) {
                            //it's an export
                            self.writeToFile();
                        }
                    }
                }
            });
        };

        //delete of a node
        self.deleteNode = function(node) {
            if (node.leaf) {
                // If it's a document we have to delete it first from the markdown collection
                self.deleteDocument(node);
                self.currentMarkdown = null;
                self.principalTree.currentMarkdownId = null;
            } else {
                //If it's a folder we have to find all his documents in him
                var documents = self.documentsInStructure(node);
                //and then delete all the documents
                documents.forEach(function(document) {
                    if (document.id === self.principalTree.currentMarkdownId ) {
                        self.currentMarkdown = null;
                        self.principalTree.currentMarkdownId = null;
                    }
                    self.deleteDocument(document);
                });
            }
            // In all case we have to delete it from the tree
            var parent = self.findParent(node);

            if (parent.children && parent.children.length > 0) {
                var indexOfNode = _.findIndex(parent.children,{id:node.id});
                if (indexOfNode >=0) {
                    parent.children.splice(indexOfNode,1);
                }
            }
            delete self.principalTree.selectedNode;

            self.save();
        };

        //Inventory of all documents in a structure
        self.documentsInStructure = function(node,storeDocuments) {
            if (!node.leaf) {
                // When call the first time without storeDocuments
                if (!storeDocuments) {
                    storeDocuments = [];
                }
                // now we will accumulate the documents in storeDocuments
                if (node.children && node.children.length > 0) {
                    node.children.forEach(function(item) {
                        if (item.leaf) {
                            storeDocuments.push(item);
                        } else {
                            self.documentsInStructure(item,storeDocuments);
                        }
                    });
                }
            } else {
                //this case happens only if th efirst node is a document
                storeDocuments = [];
                storeDocuments.push(node);
            }
            return storeDocuments;
        };

        //Method to find the parent of a node
        self.findParent = function(node, nodeParent) {
            if (!nodeParent) {
                nodeParent = self.principalTree.tree;
            }

            if (nodeParent.leaf) {
                return null;
            } else {
                var item = _.find(nodeParent.children,{id:node.id});
                if (item) {
                    return nodeParent;
                } else {
                    var result = null;
                    for(var i=0; result == null && i < nodeParent.children.length; i++){
                        if (!nodeParent.children[i].leaf) {
                            result = self.findParent(node,nodeParent.children[i]);
                        }
                    }
                    return result;
                }
            }

        };

        //Copy of a folder with documents
        self.copyNodeFolder = function(node) {
            //First we copy the structure
            self.initBuffer();
            self.principalTree.buffer.tree = {};
            angular.copy(node,self.principalTree.buffer.tree);

            self.save();

            //we initialize the buffer for documents
            self.principalTree.buffer.documents = [];

            //then we'll copy the documents of this structure
            var documents = [];
            documents = self.documentsInStructure(node,documents);

            if (documents.length > 0) {

                //We need to know if the buffer is ready for the cut, paste, etc, so we use a counter of documents waiting to be in the buffer
                self.docsPendingForBuffer = documents.length;
                self.PendingService.start();

                //and add the documents in the buffer
                documents.forEach(function(node) {
                    self.copyDocumentInBuffer(node);
                });
            } else {
                // if for exports
                if (self.exportFileName) {
                    self.writeToFile();
                }

                //If it's a folder without documents to cut
                if (self.cutNodePending) {
                    self.deleteNode(node);
                    self.cutNodePending = null;
                }
            }
        };

        //Cut of a folder with documents
        self.cutNodefolder = function(node) {
            // It's the same that copy except we add a node to delete when finish
            self.cutNodePending = node;
            self.copyNodeFolder(node);
        };



        //paste a node from the buffer
        self.pasteNodefolder = function(nodeDestinationParent, nodeSource) {
            if (!nodeSource) {
                nodeSource = self.principalTree.buffer.tree;
            }
            if (nodeSource.leaf) {
                //If it's a document we have to copy and save it
                var document = _.find(self.principalTree.buffer.documents,{_id:nodeSource.id});
                if (document) {
                    self.copyDocumentTo(document,nodeDestinationParent);
                }
            } else {
                var nodeToGo = {};
                angular.copy(nodeSource,nodeToGo);
                nodeToGo.id = uuid.v4();
                nodeToGo.children = [];
                if (nodeSource.children && nodeSource.children.length > 0) {
                    nodeSource.children.forEach(function(item) {
                        self.pasteNodefolder(nodeToGo, item);
                    });
                }

                nodeDestinationParent.children.push(nodeToGo);
            }
            // count down the node to paste
            if (self.nodesPendingPaste > 0) {
                self.nodesPendingPaste--;

                if (self.nodesPendingPaste === 0) {
                    self.PendingService.stop();
                    self.save();
                }
            }
        };

        self.howManyNodes = function(node) {
            if (node.children.length === 0) {
                return 1;
            } else {
                var nbNode = 1;
                node.children.forEach(function(item) {
                    nbNode = nbNode + self.howManyNodes(item);
                });
                return nbNode;
            }
        };

        self.pasteBufferToNode = function(nodeDestinationParent) {
            if (self.principalTree.buffer.tree) {
                self.pasteNodefolder(nodeDestinationParent);
                self.principalTree.buffer.tree = null;
            }
        };

        //export the buffer in a file
        self.exportTo = function(node,filename) {
            self.exportFileName = filename;
            self.copyNodeFolder(node);
        };

        self.writeToFile = function() {
            self.PendingService.start();
            if (fs.existsSync(self.exportFileName)) {
                fs.unlinkSync(self.exportFileName);
            }
            fs.writeFile(self.exportFileName, JSON.stringify(self.principalTree.buffer), 'utf8', function(err) {
                if (err) throw err;
                self.PendingService.stop();
                console.log('It\'s saved!');
            });
            self.exportFileName = null;
        };

        self.importFrom = function(node,filename) {
            self.initBuffer();
            self.PendingService.start();
            fs.readFile(filename,'utf8',function(err,data) {
                self.PendingService.stop();
                if (err) {
                    console.error(err);
                } else {
                    try {
                        self.principalTree.buffer = JSON.parse(data);
                        self.transformDatesInBuffer();
                        self.pasteBufferToNode(node);
                    }
                    catch (err) {
                        console.log('There has been an error parsing your JSON.');
                        console.log(err);
                    }
                }
            });
        };

        self.transformDatesInBuffer = function() {
            self.principalTree.buffer.documents.forEach(function (document) {
                document.created = new Date(document.created);
            });
        };


        self.saveTemplate = function(node,nameTemplate) {
            self.TemplateTreeService.saveTemplate(node,nameTemplate);
        };


        self.saveCurrent = function() {

            if (self.currentMarkdown) {
                self.CssService.initCurrentById(self.currentMarkdown.css);

                var copyCurrent = {};
                angular.copy(self.currentMarkdown,copyCurrent);
                self.PendingService.start();
                self.db.update({_id: self.currentMarkdown._id }, copyCurrent, {}, function (err) {
                    self.PendingService.stop();
                    if (err) {
                        console.error(err);
                    } else {
                        self.principalTree.selectedNode.name = self.currentMarkdown.title;

                        self.save();
                        setTimeout(self.refreshMath, 100);  //without angular $digest
                    }

                });
            }
        };
        
        self.clearBuffer = function() {
            delete self.principalTree.buffer;
            self.docsPendingForBuffer = 0;
            self.save();
        };

        return self;

    }
}());