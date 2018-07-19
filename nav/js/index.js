$(function () {
	// $("img").addClass("img-responsive");
	// $("li").addClass("col-md-1 text-center");
	$("ul").addClass("list-inline");
	$("li").addClass("border-left");
	$("form").on("submit", function () {
		$("#inputFilter").blur();
		return false;
	});
	$(".box").fadeOut(0, function () {
		$("#divMain").removeClass("hide");
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
			$("fieldset").hide();
			var $shows = $("li").hide().filter(function () {
				return $(this).children("a").children("span").text().toUpperCase().indexOf(txt.toUpperCase()) != -1;
			});
			$shows.show().parents("fieldset").show();
		} else {
			$("li").show();
			$("fieldset").show();
		}
	});
})