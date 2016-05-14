(function () {
    "use strict";

    var _ = require('lodash');
    var uuid = require('node-uuid');
    var fs = require('fs');


    angular
        .module('Natao')
        .service('TreeUtilService', TreeUtilService)
        .run(run);

    //Start of the service
    function run() {
    }

    //Service itself
    function TreeUtilService(DocumentsService,$q,PendingService) {

        var self = this;
        self.DocumentsService = DocumentsService;
        self.$q = $q;
        self.PendingService = PendingService;


        //Give all the ids of subfolder of the node in an array
        //this method don't return anything but change the arrayOfIds
        self.allSubFoldersIds = function(node,arrayOfIds) {
            if (node) {
                if(!arrayOfIds) {
                    arrayOfIds = [];
                }
                if (!node.leaf) {
                    arrayOfIds.push(node.id);
                    if (node.children && node.children.length > 0) {
                        node.children.forEach(function(item) {
                            self.allSubFoldersIds(item,arrayOfIds);
                        });
                    }
                }
            }
        };

        //return the number of nodes inside a node
        self.howManyNodes = function(node) {
            if (node.leaf || node.children.length === 0) {
                return 1;
            } else {
                var nbNode = 1;
                node.children.forEach(function(item) {
                    nbNode = nbNode + self.howManyNodes(item);
                });
                return nbNode;
            }
        };

        //Method to find the parent of a node
        self.findParent = function(node, nodeParent) {

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

        self.isParent = function(node,nodeParent) {
            var parent = self.findParent(node,nodeParent);
            return parent != null;
        };

        self.getNode = function(nodeId,nodeParent) {
            var nodeFound = null;
            if (nodeParent.id === nodeId) {
                nodeFound = nodeParent;
            } else {
                if (!nodeParent.leaf && nodeParent.children && nodeParent.children.length > 0) {
                    nodeParent.children.forEach(function(item) {
                        var nodeInSearch = self.getNode(nodeId,item,nodeFound);
                        if (nodeInSearch) {
                            nodeFound = nodeInSearch;
                        }
                    });
                }
            }
            return nodeFound;

        };

        self.flatFolders = function(node) {
            if (!node.leaf) {
                var arrayFolder = [node];
                if (node.children && node.children.length > 0) {
                    node.children.forEach(function(item) {
                        arrayFolder =  _.union(arrayFolder,self.flatFolders(item));
                    });
                }
                return arrayFolder;
            } else {
                return [];
            }
        };

        //Inventory of all documents in a structure
        self.documentsInStructure = function(node) {
            if (!node.leaf) {
                var arrayDocuments = [];
                if (node.children && node.children.length > 0) {
                    node.children.forEach(function(item) {
                        arrayDocuments =  _.union(arrayDocuments,self.documentsInStructure(item));
                    });
                }
                return arrayDocuments;
            } else {
                return [node];
            }
        };


        self.isFirstChild = function(node,nodeRoot) {
            var parent = self.findParent(node,nodeRoot);
            return parent && parent.children && parent.children.indexOf(node) === 0;
        };

        self.changeIds = function(node) {

            if (!node.leaf) {
                node.id = uuid.v4();

                if(node.children && node.children.length > 0) {
                    node.children.forEach(function(item) {
                        self.changeIds(item);
                    });
                }
            }

        };

        //This function return a buffer with the node to copy/cut with all the documents it contains
        self.nodeToBuffer = function(node) {

            //First we proceed with a copy of the node
            var nodeInBuffer = {};
            angular.copy(node,nodeInBuffer);


            return self.$q(function(resolve,reject) {
                var buffer = {
                    node: nodeInBuffer,
                    documents : []
                };

                // we copy all documents in documents array
                // and resolve only when all documents are in the buffer
                var listDocs = self.documentsInStructure(node);

                if (listDocs && listDocs.length > 0) {
                    var nbDocsPending = listDocs.length;
                    listDocs.forEach(function(item) {
                        self.DocumentsService
                            .findDocument(item.id)
                            .then(function(docs) {
                                buffer.documents = _.union(buffer.documents,docs);
                                nbDocsPending--;
                                if (nbDocsPending === 0) {
                                    resolve(buffer);
                                }
                            })
                            .catch(function(err) {
                                reject(err);
                            });
                    });
                } else {
                    resolve(buffer);
                }
            });
        };

        self.bufferToNode = function(buffer) {

            return self.$q(function(resolve,reject) {
                //First we proceed with a copy of the node required
                var nodeToReturn = {};
                angular.copy(buffer.node,nodeToReturn);

                self.changeIds(nodeToReturn);

                //then we have to copy all documents in the buffer by content, so new documents
                // but we have to keep the change of Ids
                if (buffer.documents && buffer.documents.length > 0) {
                    var nbDocsPending = buffer.documents.length;
                    buffer.documents.forEach(function(item) {

                        //For each document we find the node that represent it in the tree
                        var nodeDoc = self.getNode(item._id,nodeToReturn);

                        //we delete the previous Id
                        delete item._id;

                        // and the insert the new Doc
                        self.DocumentsService
                            .insertDocument(item)
                            .then(function(doc) {

                                nodeDoc.id = doc._id;

                                nbDocsPending--;
                                if (nbDocsPending === 0) {
                                    resolve(nodeToReturn);
                                }

                            })
                            .catch(function(err) {
                                reject(err);
                            });

                    });
                } else {
                    resolve(nodeToReturn);
                }
            });
        };

        self.fileToBuffer = function(fileName) {

            return self.$q(function(resolve,reject) {
                self.PendingService.start();
                fs.readFile(fileName,'utf8',function(err,data) {
                    self.PendingService.stop();
                    if (err) {
                        reject(err);
                    } else {
                        try {
                            var buffer = JSON.parse(data);
                            self.transformDatesInBuffer(buffer);
                            resolve(buffer);
                        }
                        catch (err) {
                            reject(err);
                        }
                    }
                });
            });
        };

        self.bufferToFile = function(buffer,fileName) {

            return self.$q(function(resolve,reject) {
                self.PendingService.start();
                if (fs.existsSync(fileName)) {
                    fs.unlinkSync(fileName);
                }
                fs.writeFile(fileName, JSON.stringify(buffer), 'utf8', function(err) {
                    self.PendingService.stop();
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });

            });

        };

        self.transformDatesInBuffer = function(buffer) {
            buffer.documents.forEach(function (doc) {
                doc.created = new Date(doc.created);
            });
        };

        self.moveBefore = function(nodeToMove,nodeAfter,nodeRoot) {

            var parentDestination = self.findParent(nodeAfter,nodeRoot);

            if (!self.isParent(parentDestination,nodeToMove) && nodeToMove !== parentDestination) {
                var parentSource = self.findParent(nodeToMove,nodeRoot);
                var positionSource = parentSource.children.indexOf(nodeToMove);
                var positionAfter = parentDestination.children.indexOf(nodeAfter);

                //To make copy without errors we wil pass it in the buffer and the return a node
                self.nodeToBuffer(nodeToMove)
                    .then(function(buffer) {

                        //we can delete the original when the copy is in the buffer
                        parentSource.children.splice(positionSource,1);

                        self.bufferToNode(buffer)
                            .then(function(node) {

                                //when we have the new safe node we move the copy in the right place
                                if (positionAfter === 0) {
                                    parentDestination.children.unshift(node);
                                } else {
                                    parentDestination.children.splice(positionAfter,0,node);
                                }

                            })
                            .catch(function(err) {
                                console.error(err);
                            });

                    })
                    .catch(function(err) {
                        console.error(err);
                    });
            }

        };

        self.moveAfter = function(nodeToMove,nodeBefore,nodeRoot) {


            var parentDestination = self.findParent(nodeBefore,nodeRoot);

            if (!self.isParent(parentDestination,nodeToMove) && nodeToMove !== parentDestination) {
                var parentSource = self.findParent(nodeToMove,nodeRoot);
                var positionSource = parentSource.children.indexOf(nodeToMove);
                var positionBefore = parentDestination.children.indexOf(nodeBefore);

                //To make copy without errors we wil pass it in the buffer and the return a node
                self.nodeToBuffer(nodeToMove)
                    .then(function(buffer) {

                        //we can delete the original when the copy is in the buffer
                        parentSource.children.splice(positionSource,1);

                        self.bufferToNode(buffer)
                            .then(function(node) {

                                //when we have the new safe node we move the copy in the right place
                                if (positionBefore === parentDestination.children.length - 1) {
                                    parentDestination.children.push(node);
                                } else {
                                    parentDestination.children.splice(positionBefore + 1,0,node);
                                }

                            })
                            .catch(function(err) {
                                console.error(err);
                            });

                    })
                    .catch(function(err) {
                        console.error(err);
                    });
            }

        };

        self.moveIn = function(nodeToMove,nodeMoveIn,nodeRoot) {

            if (!self.isParent(nodeMoveIn,nodeToMove) && nodeMoveIn !== nodeToMove) {
                var parentSource = self.findParent(nodeToMove,nodeRoot);
                var positionSource = parentSource.children.indexOf(nodeToMove);

                //To make copy without errors we wil pass it in the buffer and the return a node
                self.nodeToBuffer(nodeToMove)
                    .then(function(buffer) {

                        //we can delete the original when the copy is in the buffer
                        parentSource.children.splice(positionSource,1);

                        self.bufferToNode(buffer)
                            .then(function(node) {

                                //when we have the new safe node we move the copy in the right place
                                if (!nodeMoveIn.leaf && nodeMoveIn.children) {
                                    nodeMoveIn.children.push(node);
                                }

                            })
                            .catch(function(err) {
                                console.error(err);
                            });

                    })
                    .catch(function(err) {
                        console.error(err);
                    });

            }

        };


        self.deleteNode = function(node,nodeRoot) {

            return self.$q(function(resolve,reject) {

                if (node.leaf) {
                    // If it's a document we have to delete it first from the markdown collection
                    self.DocumentsService
                        .deleteDocument(node.id)
                        .then(function () {

                            //now we will delete it from the tree
                            var parent = self.findParent(node,nodeRoot);
                            if (parent.children && parent.children.length > 0) {
                                var indexOfNode = _.findIndex(parent.children,{id:node.id});
                                if (indexOfNode >=0) {
                                    parent.children.splice(indexOfNode,1);
                                }
                            }
                            resolve();
                        })
                        .catch(function(err) {
                            reject(err);
                        });
                } else {
                    //If it's a folder we have to find all his documents in him
                    var documents = self.documentsInStructure(node);
                    var nbDocsPending = documents.length;

                    if (nbDocsPending > 0) {
                        //and then delete all the documents
                        documents.forEach(function(document) {

                            self.DocumentsService
                                .deleteDocument(document.id)
                                .then(function() {
                                    nbDocsPending--;
                                    if (nbDocsPending === 0) {
                                        // In all case we have to delete it from the tree
                                        var parent = self.findParent(node,nodeRoot);

                                        if (parent.children && parent.children.length > 0) {
                                            var indexOfNode = _.findIndex(parent.children,{id:node.id});
                                            if (indexOfNode >=0) {
                                                parent.children.splice(indexOfNode,1);
                                            }
                                        }
                                        resolve();
                                    }
                                })
                                .catch(function(err) {
                                    reject(err);
                                });
                        });
                    } else {
                        resolve();
                    }

                }
            });

        };



        return self;

    }

}());