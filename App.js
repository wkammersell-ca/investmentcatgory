Ext.define('CustomApp', {
	extend: 'Rally.app.TimeboxScopedApp',
	scopeType: 'release',
	stateful: true,
	
	// Settings
	getSettingsFields: function() {
		return [
			{
				name: 'onlyshowaccepted',
				xtype: 'rallycheckboxfield',
				fieldLabel: '',
				boxLabel: 'Only show accepted work items.'
			}
		];
	},
	config: {
        defaultSettings: {
            onlyshowaccepted: true
        }
    },
	
	noFeatureId: 3,
	noInvestmentCategory: 'Unplanned Stories',
	noInvestmentColor: '#666',
	
	cvFeatureId: 1,
	cvInvestmentCategory: 'CV Defects',
	cvInvestmentColor: '#FF8200',
	
	defectFeatureId: 2,
	defectInvestmentCategory: 'non-CV Defects',
	defectInvestmentColor: '#F6A900',
	
	colors: [ '#B81B10', '#FAD200', '#F66349', '#FFDD82' ],
	
	chartColors: [],
	features: [],
	workItems: [],
	totalPoint: 0,
	
	filterContainer: null,
	noDataLabel: null,
	fromDateField: null,
	toDateField: null,
	appliedFromDate: null,
	appliedToDate: null,
	firstlaunch: false,
	app: null,
	
	launch: function() {
		app = this;
		filterContainer = app.down( 'container' );
		app.firstLaunch = true;
		app.callParent( arguments );
	},
	
	onScopeChange: function( scope ) {
		app.callParent( arguments );
		app.initializeFilters();
	},
	
	getState: function() {
		if( app.fromDateField && app.toDateField ) {
			return {
	        	fromDate: app.fromDateField.value,
	     		toDate: app.toDateField.value
			};
		} else {
			return {
	        	fromDate: null,
	     		toDate: null
			};
		}
	},
	
	applyState: function(state) {
	    this.appliedFromDate = state.fromDate;
	    this.appliedToDate = state.toDate;
	},
	
	// Set up filters, if needed
	initializeFilters:function(){
		app.hideHeader( false );
		
		// Show start and end data filters if we're not on a release-filtered page
		// The filter container will be automatically added by the app if we're not on a release-filtered page
		if ( filterContainer ) {
			var orLabelId = 'orLabel';
			var fromDateFieldId = 'fromDateFilter';
			var toDateFieldId = 'toDateFilter';
			var beginButtonId = 'beginButton';
		
			var beginButton = filterContainer.down( '#' + beginButtonId );
			
			if( !beginButton ) {
				filterContainer.add( {
					xtype: 'label',
					html: '--or--',
					anchor: '100%',
					itemId: orLabelId
				} );
			
				app.fromDateField = filterContainer.add( {
					xtype: 'datefield',
					anchor: '100%',
					fieldLabel: 'From',
					itemId: fromDateFieldId,
					name: 'from_date',
					value: this.appliedFromDate ? new Date( this.appliedFromDate ) : null
				} );
			
				app.toDateField = filterContainer.add( {
					xtype: 'datefield',
					anchor: '100%',
					fieldLabel: 'To',
					itemId: toDateFieldId,
					name: 'to_date',
					value: this.appliedToDate ? new Date( this.appliedToDate ) : null
				} );
				
				filterContainer.add( {
					xtype: 'rallybutton',
					itemId: beginButtonId,
					text: 'Apply Release or Date Range',
					handler: function(){ app.saveState(); app.start( app.fromDateField, app.toDateField ); },
					style: {
						'background-color': app.colors[0],
						'border-color': app.colors[0]
					}
				} );
				
				// Don't make the user click the Begin button the first time if there are saved values
				if( app.firstLaunch && ( app.fromDateField.value || app.toDateField.value || app.getContext().getTimeboxScope().getRecord() ) ) {
					app.firstLaunch = false;
					app.start( app.fromDateField, app.toDateField );
				}
			}
		} else {
			app.start( null, null );
		}
	},
	
	hideHeader:function( hiddenValue ) {
		if( filterContainer ) {
			filterContainer.setVisible( !hiddenValue );
		}
	},
	
	start: function( fromDateField, toDateField ) {
		// Delete any existing UI components
		if( app.down( 'rallychart' ) ) {
			app.down( 'rallychart' ).destroy();
		}
		if( app.noDataLabel ) {
			app.noDataLabel.destroy();
		}
		
		// Show loading message
		app._myMask = new Ext.LoadMask( Ext.getBody(),
			{
				msg: "Loading..."
			}
		);
		app._myMask.show();
		
		var dataScope = app.getContext().getDataContext();
		var scope = app.getContext().getTimeboxScope().getRecord();
		var store = Ext.create(
			'Rally.data.wsapi.artifact.Store',
			{
				models: ['UserStory','Defect'],
				fetch: ['ObjectID','PlanEstimate','Feature','Tags'],
				context: dataScope,
				limit: Infinity
			},
			app
		);
		
		var fromDate = fromDateField ? fromDateField.value : null;
		var toDate = toDateField ? toDateField.value : null;
		
		if ( !fromDate && !toDate && scope ) {
			// Load all the work items for app release
			var releaseFilter = Ext.create('Rally.data.wsapi.Filter',
				{
					property: 'Release.Name',
					value: scope.data.Name
				}
			);				
			store.addFilter( releaseFilter, false );
		} else {
			if ( fromDate) {
				var fromDateFilter = Ext.create('Rally.data.wsapi.Filter',
					{
						property: 'InProgressDate',
						operator: '>=',
						value: fromDateField.value
					}
				);				
				store.addFilter( fromDateFilter, false );
			}
			if ( toDate ) {
				var toDateFilter = Ext.create('Rally.data.wsapi.Filter',
					{
						property: 'AcceptedDate',
						operator: '<=',
						value: toDateField.value
					}
				);				
				store.addFilter( toDateFilter, false );
			}
		}
		
		// Check if the settings say we should only look at accepted work items
		var onlyShowAccepted = app.getSetting( 'onlyshowaccepted' );
		if ( onlyShowAccepted ) {
			var acceptedFilter = Ext.create('Rally.data.wsapi.Filter',
				{
					property: 'ScheduleState',
					operator: '>=',
					value: 'Accepted'
				}
			);				
			store.addFilter(acceptedFilter, false);
		}
		
		// Resetting global variables
		app.features = {};
		app.chartColors = [];
		
		app.features[ app.cvFeatureId ] = {};
		app.features[ app.cvFeatureId ].estimate = 0;
		app.features[ app.cvFeatureId ].investmentCategory = app.cvInvestmentCategory;
		app.chartColors.push( app.cvInvestmentColor );
		
		app.features[ app.defectFeatureId ] = {};
		app.features[ app.defectFeatureId ].estimate = 0;
		app.features[ app.defectFeatureId ].investmentCategory = app.defectInvestmentCategory;
		app.chartColors.push( app.defectInvestmentColor );
		
		app.features[ app.noFeatureId ] = {};
		app.features[ app.noFeatureId ].estimate = 0;
		app.features[ app.noFeatureId ].investmentCategory = app.noInvestmentCategory;
		app.chartColors.push( app.noInvestmentColor );
		
		app.workItems = [];
		app.totalPoints = 0;
		
		store.load( {
				scope: app,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
								_.each(records, function(record){
									var featureId = app.noFeatureId;
									if ( record.raw.Tags && ( _.find( record.raw.Tags._tagsNameArray, function( tag ) {
												return ( tag.Name == 'Customer Voice' );
											} ) ) ) {
										featureId = app.cvFeatureId;
									} else if ( record.raw.Feature ) {
										featureId = record.raw.Feature.ObjectID;
									} else if ( record.get('_type') == 'defect' ) {
										featureId = app.defectFeatureId;
									}
									if( !( featureId in app.features ) ) {
										app.features[ featureId ] = {};
										app.features[ featureId ].estimate = 0;
										app.features[ featureId ].investmentCategory = app.noInvestmentCategory;
									}
									app.features[ featureId ].estimate += record.raw.PlanEstimate;
									app.totalPoints += record.raw.PlanEstimate;
								},app);
							
							app._myMask.msg = 'Loading Features...';
							app.loadFeatures( 0 );
						}
						else {
							app.showNoDataBox();	
						}
					}
				}
		});
	},
	
	loadFeatures: function( featureIndex ) {
		var keys = Object.keys( app.features );
		if ( featureIndex >= keys.length ) {
			app.compileData();
		} else if ( ( keys[ featureIndex ] == app.noFeatureId ) ||
					( keys[ featureIndex ] == app.defectFeatureId ) ||
					( keys[ featureIndex ] == app.cvFeatureId ) ) {
			app.loadFeatures( featureIndex + 1 );
		} else {
			// Set a default as an error here
			app.features[ keys[ featureIndex ] ].investmentCategory = 'Unknown';
			
			var dataScope = {
				workspace: app.getContext().getWorkspaceRef(),
				project: null
			};
			
			var store = Ext.create(
				'Rally.data.wsapi.artifact.Store',
				{
					models: ['PortfolioItem/Feature'],
					fetch: ['ObjectID','InvestmentCategory'],
					filters: [
						{
							property: 'ObjectID',
							value: keys[ featureIndex ]
						}
					],
					context: dataScope,
					limit: Infinity
				},
				app
			);
			
			store.load( {
				scope: app,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
							_.each(records, function( record ){
								var featureId = record.raw.ObjectID;
								app.features[ featureId ].investmentCategory = record.raw.InvestmentCategory;									
							},app);
						}
					}	
					app.loadFeatures( featureIndex + 1 );
				}
			});
		}
	},
	
	compileData: function(){
		app._myMask.msg = 'Compiling Data...';
		
		var investmentSums = {};
		_.each( app.features, function( feature ) {
			if( !( feature.investmentCategory in investmentSums ) ) {
				investmentSums[ feature.investmentCategory ] = 0;
				
				// push on more colors if we're past the first set of sums
				var keysLength = Object.keys( investmentSums ).length;
				if ( keysLength > 3 ) {
					app.chartColors.push( app.colors[ ( keysLength - 4 ) % app.colors.length ] );
				}
			}
			investmentSums[ feature.investmentCategory ] += feature.estimate;
		}, app);
		
		var series = [];
		series.push( {} );
		series[0].name = 'Investment Categories';
		series[0].colorByPoint = true;
								
		series[0].data = [];
		_.each( _.keys( investmentSums ), function( investmentCategory ) {
			series[0].data.push(
				{
					name: investmentCategory,
					y: investmentSums[ investmentCategory ] / app.totalPoints
				}
			);
		}, app );
							
		app.makeChart( series );
	},
	
	makeChart: function( series ){
		var chart = app.add({
				xtype: 'rallychart',
				chartConfig: {
					chart:{
						type: 'pie'
					},
					title:{
						text: 'Investment Category Spend'
					},
					tooltip: {
						pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
					},
					plotOptions: {
						pie: {
							allowPointSelect: true,
							cursor: 'pointer',
							dataLabels: {
								enabled: true,
								format: '<b>{point.name}</b>: {point.percentage:.1f} %'
							}
						}
					}
				},
									
				chartData: {
					series: series
				}
		});
		
		// Workaround bug in setting colors - http://stackoverflow.com/questions/18361920/setting-colors-for-rally-chart-with-2-0rc1/18362186
		chart.setChartColors( app.chartColors );
		
		app._myMask.hide();
	},
	
	showNoDataBox:function(){
		app._myMask.hide();
		app.noDataLabel = app.add({
			xtype: 'label',
			text: 'No data was found. Check if there are work items assigned for the Release. You may also need to include Child and/or Parent projects in your scope.'
		});
	}
});