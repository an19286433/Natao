(function () {
    "use strict";

    angular
        .module('Natao')
        .controller('SettingsController', SettingsController);


    function SettingsController($rootScope,PreferencesService,DatabaseService,$location,$translate,$sce,fileDialog) {
        console.log('SettingsController');

        var self = this;

        self.PreferencesService = PreferencesService;
        self.$sce = $sce;
        self.DatabaseService = DatabaseService;

        self.firstTime = self.PreferencesService.fileExist();
        self.fileDialog = fileDialog;

        // for the first time, we have to go step by step
        if (!self.PreferencesService.fileExist()) {
            self.step = 1;
        } else {
            self.step = 5;
        }

        // The only way to the good message with asynchroneous loading of translation
        $rootScope.$on('$translateChangeSuccess', function () {
            self.message = $translate.instant('SETTING_MESSAGE');
        });


        self.settingsValide = function() {
            self.valid = self.PreferencesService.isValid();
        };

        self.save = function() {
            self.PreferencesService.save();
            $location.path( '/app' );
        };

        self.changeLanguage = function(language) {
            self.PreferencesService.preferences.language = language;
            $translate.use(self.PreferencesService.preferences.language);
            //self.initMessage();
            self.settingsValide();
            self.step = 2;
        };


        self.newDatabase = function() {
            self.fileDialog.saveAs(function(filename) {
                self.PreferencesService.settings.fileDatabase = filename;
                console.log('fileDatabase',self.PreferencesService.settings.fileDatabase);
            },'Natao.db',['db']);
        };

        self.chooseDatabase = function() {
            self.fileDialog.openFile(function(filename){
                self.PreferencesService.settings.fileDatabase = filename;
                self.PreferencesService.init();
            }, false, ['db']);

        };

        self.showMessage = function() {
            return (self.step > 1)
        };

        self.showFile = function() {
            return (self.step > 1)
        };

        self.showId = function() {
            return (self.step > 2)
        };

        self.showColor = function() {
            return (self.step > 3)
        };

        self.settingsValide();




    }

}());