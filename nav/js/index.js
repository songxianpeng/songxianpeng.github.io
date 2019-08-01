$(function () {
	$(".box").fadeOut(0, function () {
		$("#divMain").removeClass("invisible");
	});
	// $("img").addClass("img-responsive");
	// $("li").addClass("col-md-1 text-center");
	$("ul").addClass("navbar-nav d-block mr-auto list-unstyled");
	$("li").addClass("nav-item float-left");
	$("a").addClass("nav-link");
	$("form").on("submit", function () {
		$("#inputFilter").blur();
		return false;
	});
	
})

$(function () {
	$("#inputFilter").keyup(function (event) {
		switch (event.keyCode) {
			case 27:
			case 96:
				$("#inputFilter").blur();
		}
		var txt = $("#inputFilter").val();
		if ($.trim(txt) != "") {
			$(".card").hide();
			var $shows = $("li").hide().filter(function () {
				return $(this).children("a").children("span").text().toUpperCase().indexOf(txt.toUpperCase()) != -1;
			});
			$shows.show().parents(".card").show();
		} else {
			$("li").show();
			$(".card").show();
		}
	});
})