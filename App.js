Ext.define('CustomApp', {
	extend: 'Rally.app.TimeboxScopedApp',
	scopeType: 'release',
	noFeatureId: 0,
	noInvestmentCategory: 'Unplanned',
	features: [],
	workItems: [],
	totalPoint: 0,
	
	onScopeChange: function( scope ) {
		this.callParent( arguments );
		this.start( scope );
	},
	
	start: function( scope ) {
		console.log( 'Starting...');	
		// Delete any existing UI components
		if( this.down( 'rallychart' ) ) {
			this.down( 'rallychart' ).destroy();
		}
		if( this.down( 'label' ) ) {
			this.down( 'label' ).destroy();
		}
		
		console.log( 'Adding mask...');
		// Show loading message
		this._myMask = new Ext.LoadMask( Ext.getBody(),
			{
				msg: "Loading work items..."
			}
		);
		this._myMask.show();
		
		console.log( 'Building Store...');
		// Load all the work items for this release
		var dataScope = this.getContext().getDataContext();
		var store = Ext.create(
			'Rally.data.wsapi.artifact.Store',
			{
				models: ['UserStory','Defect','DefectSuite'],
				fetch: ['ObjectID','PlanEstimate','Feature'],
				filters: [
					{
						property: 'Release.Name',
						value: scope.record.data.Name
					}
				],
				context: dataScope,
				limit: Infinity
			},
			this
		);
		
		console.log( 'Resetting global variables' );
		this.features = {};
		this.features[ this.noFeatureId ] = {};
		this.features[ this.noFeatureId ].estimate = 0;
		this.features[ this.noFeatureId ].investmentCategory = this.noInvestmentCategory;
		this.workItems = [];
		this.totalPoints = 0;
		
		console.log( 'Loading Store...');		
		store.load( {
				scope: this,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
								_.each(records, function(record){
									var featureId = this.noFeatureId;
									if ( record.raw.Feature ) {
										featureId = record.raw.Feature.ObjectID;
									}
									if( !( featureId in this.features ) ) {
										this.features[ featureId ] = {};
										this.features[ featureId ].estimate = 0;
										this.features[ featureId ].investmentCategory = this.noInvestmentCategory;
									}
									this.features[ featureId ].estimate += record.raw.PlanEstimate;
									this.totalPoints += record.raw.PlanEstimate;
								},this);
							
							console.log( this.features);
							console.log( 'Loading Features...' );
							this._myMask.msg = 'Loading Features...';
							this.loadFeatures( 0 );
						}
						else if(records.length === 0 && this.features.length === 0){
								this.showNoDataBox();	
						}
					}
				}
		});
	},
	
	loadFeatures: function( featureIndex ) {
		console.log( 'Feature Index = ' + featureIndex);
		var keys = Object.keys( this.features );
		
		if ( featureIndex >= keys.length ) {
			this.compileData();
		} else if ( keys[ featureIndex ] == this.noFeatureId ) {
			this.loadFeatures( featureIndex + 1 );
		} else {
			// Set a default as an error here
			this.features[ keys[ featureIndex ] ].investmentCategory = 'Unknown';
			
			var dataScope = {
				workspace: this.getContext().getWorkspaceRef(),
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
				this
			);
			
			store.load( {
				scope: this,
				callback: function( records, operation ) {
					if( operation.wasSuccessful() ) {
						if (records.length > 0) {
							_.each(records, function( record ){
								var featureId = record.raw.ObjectID;
								this.features[ featureId ].investmentCategory = record.raw.InvestmentCategory;									
							},this);
						}
					}	
					this.loadFeatures( featureIndex + 1 );
				}
			});
		}
	},
	
	compileData: function(){
		this._myMask.msg = 'Compiling Data...';
		console.log( 'Compiling Data ... ' );
		
		var investmentSums = {};
		_.each( this.features, function( feature ) {
			if( !( feature.investmentCategory in investmentSums ) ) {
				investmentSums[ feature.investmentCategory ] = 0;
			}
			investmentSums[ feature.investmentCategory ] += feature.estimate;
		});
		
		var series = [];
		series.push( {} );
		series[0].name = 'Investment Categories';
		series[0].colorByPoint = true;
								
		series[0].data = [];
		_.each( _.keys( investmentSums ), function( investmentCategory ) {
			series[0].data.push(
				{
					name: investmentCategory,
					y: investmentSums[ investmentCategory ] / this.totalPoints
				}
			);
		}, this );
							
		this.makeChart( series );
	},
	
	makeChart: function( series ){
		var chart = this.add({
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
		chart.setChartColors( [ '#005EB8', '#FF8200', '#FAD200', '#7CAFD7', '#F6A900', '#FFDD82' ] );
		
		this._myMask.hide();
	},
	
	showNoDataBox:function(){
		this._myMask.hide();
		this.add({
			xtype: 'label',
			text: 'There is no data. Check if there are iterations in scope and work items with PlanEstimate assigned for iterations'
		});
	}
});