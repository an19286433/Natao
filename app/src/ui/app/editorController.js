(function () {
    "use strict";

    var uuid = require('node-uuid');

    angular
        .module('Natao')
        .controller('EditorController', EditorController);


    function EditorController($timeout,PreferencesService,PrincipalTreeService,CssService,TemplateTreeService,focus,fileDialog,$location,PendingService) {
        console.log('EditorController');

        var self = this;
        //self.$showdown = $showdown;
        self.$timeout = $timeout;
        self.PreferencesService = PreferencesService;
        self.PrincipalTreeService = PrincipalTreeService;
        self.CssService = CssService;
        self.TemplateTreeService = TemplateTreeService;
        self.PendingService = PendingService;
        self.fileDialog = fileDialog;
        self.$location = $location;
        self.inPrint = false;
        self.focus = focus;
        self.editorOptions = {
            lineWrapping : true,
            lineNumbers: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            mode: 'gfm'
        };

        MathJax.Hub.Queue(["Typeset",MathJax.Hub]);

        // options for the color Picker
        self.optionsColumn = {
            columns: 4,
            roundCorners: true
        };

        self.customColors = ['#7bd148', '#5484ed', '#a4bdfc', '#46d6db', '#7ae7bf', '#51b749', '#fbd75b', '#ffb878', '#ff887c', '#dc2127', '#dbadff', '#000000' ];
        

        self.refresh = function() {

            // to avoid save (which is blocking for the user) at each change, we use a timeout at 1s.
            //each time this function is called, the timeout restart
            if (self.refreshTimeout) {
                clearTimeout(self.refreshTimeout);
            }
            self.refreshTimeout = setTimeout(function() {
                self.refreshTimeout = null;
                self.PrincipalTreeService.saveCurrent();
            },1000);

        };

        self.offPrint = function() {
            self.inPrint = false;
        };

        self.showViewer = function() {
            return self.PrincipalTreeService.currentMarkdown && self.PreferencesService.preferences.showViewer;
        };

        self.showEditor = function() {
            return self.PrincipalTreeService.currentMarkdown && self.PreferencesService.preferences.showEditor;
        };

        self.print = function() {
            self.PreferencesService.preferences.showViewer = true;
            self.inPrint = true;
            setTimeout(window.print, 1050);       //without angular $digest
            self.$timeout(self.offPrint, 1150);  //with angular $digest
        };

        self.openClassPopover = function() {
            self.newClass = null;
            self.templateName = null;
            self.focus('newClassName');
        };


        self.addClassPopover = function(hide){
            if (self.newClass && self.newClass !== '') {
                self.PrincipalTreeService.addClass(self.newClass,self.templateName);
            }
            hide();
        };


        // -------------------Folder Popover -----------------

        // the possible values of folderPopover are ['buttonBar','edit','addFolder','addDocument','delete','saveTemplate']

        self.openFolderPopover = function(node) {
            self.currentNode = node;
            self.newNameFolder = node.name;
            self.newDefaultCss = node.defaultCss;
            self.folderPopover = 'buttonBar';
            self.newColor = node.color;
            console.log('disabled',self.pasteButtonDisabled());
        };

        self.pasteButtonDisabled = function() {
            return !(self.PrincipalTreeService && self.PrincipalTreeService.principalTree && self.PrincipalTreeService.principalTree.buffer && self.PrincipalTreeService.principalTree.buffer.tree  && self.PrincipalTreeService.docsPendingForBuffer === 0);
        };

        self.editFolder = function() {
            self.folderPopover = 'edit';
            self.focus('folderName');

        };

        self.openSaveTemplate = function() {
            self.folderPopover = 'saveTemplate';
            self.focus('templateName');
            self.templateName = null;

        };

        self.openAddFolder = function() {
            self.newFolderName = null;
            self.folderPopover = 'addFolder';
            self.templateName = null;
            self.focus('addFolderName');
        };

        self.openAddDocument = function() {
            self.folderPopover = 'addDocument';
            self.newDocumentName = null;
            self.focus('addDocumentName');
        };

        self.openDelete = function() {
            self.folderPopover = 'delete';
            self.cancel = false;
        };

        self.openConfirmTemplate = function() {
            self.folderPopover = 'confirmTemplate';
            self.cancel = false;
        };

        self.cancelAction = function(hide) {
            self.cancel = true;
            hide();
        };

        self.submitFolderPopover = function(hide){
            switch (self.folderPopover) {
                case 'edit':
                    self.saveFolder(hide);
                    break;
                case 'addFolder':
                    self.addFolder(hide);
                    break;
                case 'addDocument':
                    self.addDocument(hide);
                    break;
                case 'saveTemplate':
                    self.saveTemplate(hide);
                    break;
                case 'confirmTemplate':
                    if (!self.cancel) {
                        self.saveForceTemplate(hide);
                    } else {
                        hide();
                    }
                    break;
                case 'delete':
                    if (!self.cancel) {
                        self.PrincipalTreeService.deleteNode(self.currentNode);
                    } else {
                        hide();
                    }
                    break;
                default: break;
            }
        };

        self.copyFolder = function(hide) {
            self.PrincipalTreeService.copyNodeFolder(self.currentNode);
            hide();
        };

        self.copyDocument = function() {
            self.PrincipalTreeService.copyNodeFolder(self.PrincipalTreeService.principalTree.selectedNode);
        };

        self.cutFolder = function(hide) {
            self.PrincipalTreeService.cutNodefolder(self.currentNode);
            hide();
        };

        self.cutDocument = function() {
            self.PrincipalTreeService.cutNodefolder(self.PrincipalTreeService.principalTree.selectedNode);
        };

        self.deleteDocument = function(hide) {
            self.PrincipalTreeService.deleteNode(self.PrincipalTreeService.principalTree.selectedNode);
            hide();
        };

        self.exportDocument = function() {
            self.fileDialog.saveAs(function(filename) {
                self.PrincipalTreeService.exportTo(self.PrincipalTreeService.principalTree.selectedNode,filename);
            },'nataoExport.json',['json']);
        };

        self.pasteFolder = function(hide) {
            if (hide) {
                self.PrincipalTreeService.pasteBufferToNode(self.currentNode);
                hide();
            } else {
                //it's done without selecting a node so the node will be the tree himself
                self.PrincipalTreeService.pasteBufferToNode(self.PrincipalTreeService.principalTree.tree);
            }
        };


        self.exportTo = function(hide) {
            self.fileDialog.saveAs(function(filename) {
                self.PrincipalTreeService.exportTo(self.currentNode,filename);
                hide();
            },'nataoExport.json',['json']);
        };

        self.importFrom = function(hide) {
            self.fileDialog.openFile(function(filename) {
                if (hide) {
                    self.PrincipalTreeService.importFrom(self.currentNode,filename);
                    hide();
                } else {
                    self.PrincipalTreeService.importFrom(self.PrincipalTreeService.principalTree.tree,filename);
                }
            }, false, ['json']);
        };

        self.saveTemplate = function(hide) {
            if (self.templateName && self.templateName.length > 0) {
                if (self.PrincipalTreeService.TemplateTreeService.getTemplate(self.templateName)) {
                    self.openConfirmTemplate();
                } else {
                    self.PrincipalTreeService.saveTemplate(self.currentNode,self.templateName);
                    hide();
                }
            }
        };

        self.saveForceTemplate = function(hide) {
            self.PrincipalTreeService.saveTemplate(self.currentNode,self.templateName);
            hide();
        };


        self.addFolder = function(hide) {
            if (self.newFolderName && self.newFolderName.length > 0) {
                self.PrincipalTreeService.addFolder(self.newFolderName, self.currentNode, self.templateName);
            }
            hide();
        };

        self.saveFolder = function(hide) {
            if (self.newNameFolder && self.newNameFolder.length > 0) {
                self.currentNode.name = self.newNameFolder;
                self.currentNode.color = self.newColor;
                self.currentNode.defaultCss = self.newDefaultCss;
                self.PrincipalTreeService.save();
            }
            hide();
        };

        self.addDocument = function(hide) {
            if (self.newDocumentName && self.newDocumentName.length > 0) {
                self.PrincipalTreeService.addMarkdown(self.currentNode,self.newDocumentName);
            }
            hide();
        };

    }

}());