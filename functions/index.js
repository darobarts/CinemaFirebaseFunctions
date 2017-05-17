var functions = require('firebase-functions');
var admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

var featureConstants = new Map();
featureConstants.set('MovieXRating', 2);
featureConstants.set('MovieXRevenue', 1);
featureConstants.set('MovieXBudget', 1);
featureConstants.set('MovieXDirector', 4);
featureConstants.set('MovieXActor', 3);
featureConstants.set('MovieXGenre', 3);

function getMoviesByValue(value, valueDirectory) {
	var ref = admin.database().ref(valueDirectory).child(value);
	return ref.once('value').then(function(movies) {
		var movieList = [];
		if (movies && movies.val()) {
			console.log(movies);
			console.log(movies.val());
			movieList = Object.keys(movies.val());
		}
		return [valueDirectory, movieList];
	});
}

function getUserList(listName, userId) {
	var ref = admin.database().ref('users/' + userId).child(listName);
	return ref.once('value').then(function(movies) {
		var movieList = [];
		if (movies && movies.val()) {
			console.log(movies);
			console.log(movies.val());
			movieList = Object.keys(movies.val());
		}
		return movieList;
	});
}

function makeQueue(lists) {
	var movies = {};
	//for each list of movies gotten
	for (let idx = 0; idx < lists.length; idx++) {
		const valueDirectory = lists[idx][0];
		var list = lists[idx][1];
		console.log("LIST: " + list);
		//for each movie in specific list
		for (let movieIdx = 0; movieIdx < list.length; movieIdx++) {
			var currentVal = movies[list[movieIdx]];
			//set point values for each list
			movies[list[movieIdx]] = (currentVal || 0) + (1*featureConstants.get(valueDirectory));
		}
	}
	console.log("Movies to base queue off");
	console.log(movies);

	//transfer map into array so we can sort
	var movieTuples = [];
	for (var key in movies) {
		movieTuples.push([key, movies[key]]);
	}

	//sort movies and return top 5
	movieTuples.sort(function(a, b) {
		return b[1] - a[1];
	});

	console.log(movieTuples);
	return movieTuples;
}

exports.updateQueue = functions.database.ref('users/{userId}/likeList/{movieId}')
	.onWrite(event => {
		//get most recent entry into likeList table
		const movie = event.data;
		//get reference to the user of likeList
		const userRef = event.data.ref.parent.parent;
		//get the id of the movie most recently added to likeList
		const movieId = movie.key
		//user id
		const userId = event.params.userId;

		//get movie info for added movie
		var movieRef = admin.database().ref("movies");
		return movieRef.orderByChild("id").equalTo(movieId).once("child_added").then(
			function(movieData) {
				//get rating bin movie falls under
				const ratingBin = movieData.child('ratingBin').val();
				//get list of genres under the movie
				const genres = Object.keys(movieData.child('genres').val());
				//get list of actors under the movie
				const actors = Object.keys(movieData.child('actors').val());
				const director = movieData.child('director').val().toLowerCase();
				const budgetBin = movieData.child('budgetBin').val();
				const revenueBin = movieData.child('revenueBin').val();

				var requestArrays = [
					getMoviesByValue(ratingBin, 'MovieXRating'),
					getMoviesByValue(budgetBin, 'MovieXBudget'),
					getMoviesByValue(revenueBin, 'MovieXRevenue'),
					getMoviesByValue(director, 'MovieXDirector')];

				//add each genre for movie in analysis
				for (let index = 0; index < genres.length; index++) {
					requestArrays.push(getMoviesByValue(genres[index], 'MovieXGenre'));	
				}
				//add each top actor for movie in analysis
				for (let index = 0; index < actors.length; index++) {
					requestArrays.push(getMoviesByValue(actors[index].toLowerCase(), 'MovieXActor'));	
				}
				//Promise waits for all async requests to return before executing below code
				return Promise.all(requestArrays).then(function(results) {

					console.log("Getting queue");
					//remove movies that are on likeList, wishList, and hateList
					//HERE
					//make the queue 
					var movieQueue = makeQueue(results);

					return Promise.all([getUserList("likeList", userId), getUserList("hateList", userId), getUserList("wishList", userId)]).then(function(lists) {
						var likeList = lists[0];
						var hateList = lists[1];
						var wishList = lists[2];

						for (var idx =1; idx < movieQueue.length && idx < 6; idx++) {
							var movieName = movieQueue[idx][0];
							//if movie is not contained in any user lists already
							if (likeList.indexOf(movieName) === -1
								&& hateList.indexOf(movieName) === -1
								&& wishList.indexOf(movieName) === -1) {
								console.log("Added unique movie to queue")
								userRef.child('queue').child(movieQueue[idx][0]).set(movieQueue[idx][1]);	
							} 
							
						}
						console.log("Finishing queue write");

						return;
					});
					
				});
		});
	});
